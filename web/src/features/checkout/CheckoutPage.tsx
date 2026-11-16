import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { AuthRequestError, currentAccount, type AuthFailure } from "../auth/auth-api";
import { useCart, removePurchasedCartLines, type CartLine } from "../cart/cart-store";
import {
  fetchCartQuote,
  QuoteRequestError,
  type QuoteFailure,
  type CartQuote,
} from "../cart/quote-api";
import { useReadRequest } from "../../shared/api/use-read-request";
import { LoadingSkeleton } from "../../shared/loading/LoadingSkeleton";
import { displayEuro } from "../../shared/format/money";
import { productHref } from "../../shared/navigation/product-links";
import { platformLabels, regionLabels } from "../../shared/product/identity";
import {
  attemptMatchesCart,
  clearCheckoutAttempt,
  createCheckoutAttempt,
  readCheckoutAttempt,
  readCheckoutConfirmation,
  parseCheckoutConfirmation,
  saveCheckoutConfirmation,
  type CheckoutConfirmation,
} from "./checkout-attempt";
import { CheckoutRequestError, placeCheckoutOrder, type CheckoutFailure } from "./checkout-api";
import styles from "./CheckoutPage.module.css";

const quoteErrors: Record<QuoteFailure, string> = {
  invalid: "Some items need attention. Review your cart and try again.",
  unavailable: "Current prices are temporarily unavailable.",
  timeout: "Checking prices took too long. Try again.",
  network: "We couldn't reach the store. Check your connection.",
  unexpected: "We couldn't verify your cart. Try again.",
};
const accountErrors: Record<AuthFailure, string> = {
  invalid: "Please sign in again.",
  taken: "We couldn't check your account.",
  limited: "Too many requests. Try again shortly.",
  unavailable: "Account verification is temporarily unavailable.",
  network: "We couldn't reach the account service.",
  unexpected: "We couldn't verify your account.",
};
const purchaseErrors: Record<CheckoutFailure, string> = {
  unauthorized: "Your session has expired. Sign in and retry the same order.",
  "price-changed": "One or more prices have changed. Review the refreshed total before ordering.",
  "sold-out": "An item just sold out. Remove unavailable items and try again.",
  "idempotency-conflict":
    "This order attempt doesn't match its original details. Please review it before starting another order.",
  invalid: "We couldn't submit these order details. Please review your cart.",
  unavailable:
    "Checkout is temporarily unavailable. Your order may still have been placed; retry the previous attempt to confirm.",
  timeout:
    "The response took too long. Your order may have completed; retry the same attempt to confirm.",
  network: "Connection lost. Your order may have completed; retry the same attempt to confirm.",
  unexpected: "We couldn't confirm the order. Retry the same attempt before starting another.",
};

function CheckoutSummary({ quote }: { quote: CartQuote }) {
  return (
    <section className={styles.card} aria-labelledby="checkout-items-title">
      <h2 id="checkout-items-title">Your order</h2>
      <ul className={styles.items}>
        {quote.lines.map((item) => (
          <li key={item.offerId} className={styles.item}>
            <div>
              <h3>{item.productName ?? "Unavailable offer"}</h3>
              {item.edition && item.platform && item.region && (
                <p>
                  {item.edition} · {platformLabels[item.platform]} · {regionLabels[item.region]}
                </p>
              )}
              {item.sellerName && <p>Sold by {item.sellerName}</p>}
              <p>Quantity: 1</p>
              {!item.available && (
                <p className={styles.errorText}>This offer is no longer available.</p>
              )}
              {item.productSlug && (
                <Link className={styles.textLink} to={productHref(item.productSlug, item.offerId)}>
                  View offer
                </Link>
              )}
            </div>
            <strong className={styles.linePrice}>
              {item.unitPriceCents === null ? "—" : displayEuro(item.unitPriceCents)}
            </strong>
          </li>
        ))}
      </ul>
      {quote.totalCents === null ? (
        <p className={styles.warning} role="status">
          Remove unavailable offers from your cart before continuing.
        </p>
      ) : (
        <div className={styles.total}>
          <span>Total</span>
          <strong>{displayEuro(quote.totalCents)}</strong>
        </div>
      )}
    </section>
  );
}

function CheckoutContent({ lines }: { lines: readonly CartLine[] }) {
  const navigate = useNavigate();
  const mounted = useRef(true);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [, refreshAttempt] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const quoted = useReadRequest({
    read: (signal) => fetchCartQuote(lines, signal),
    failure: (reason): QuoteFailure =>
      reason instanceof QuoteRequestError ? reason.kind : "unexpected",
    timeout: "timeout" as QuoteFailure,
  });
  const account = useReadRequest({
    read: currentAccount,
    failure: (reason): AuthFailure =>
      reason instanceof AuthRequestError ? reason.kind : "unexpected",
    timeout: "unavailable" as AuthFailure,
  });
  const buyer = account.state.status === "ready" ? account.state.data : null;
  const pending = buyer ? readCheckoutAttempt(buyer.id) : null;
  const canPlace =
    buyer !== null && quoted.state.status === "ready" && quoted.state.data.totalCents !== null;
  const canRetry = pending !== null;
  async function submit() {
    if (submittingRef.current || (!canPlace && !canRetry) || !buyer) return;
    const attempt =
      pending ??
      (quoted.state.status === "ready"
        ? createCheckoutAttempt(buyer.id, lines, quoted.state.data)
        : null);
    if (!attempt) {
      setError(
        "We couldn't save this order attempt. Check your browser storage settings and try again.",
      );
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    refreshAttempt((value) => value + 1);
    try {
      const result = await placeCheckoutOrder(attempt);
      const cartCleared = removePurchasedCartLines(attempt.lines.map((line) => line.offerId));
      const confirmation: CheckoutConfirmation = {
        buyerId: buyer.id,
        orderId: result.orderId,
        totalCents: result.totalCents,
        cartCleared,
      };
      saveCheckoutConfirmation(confirmation);
      clearCheckoutAttempt(buyer.id);
      if (mounted.current)
        navigate(`/orders/${result.orderId}`, {
          replace: true,
          state: { cartCleared },
        });
    } catch (reason) {
      if (!mounted.current) return;
      const kind: CheckoutFailure =
        reason instanceof CheckoutRequestError ? reason.kind : "unexpected";
      setError(purchaseErrors[kind]);
      if (kind === "price-changed" || kind === "sold-out" || kind === "invalid") {
        clearCheckoutAttempt(buyer.id);
        quoted.retry();
      }
      refreshAttempt((value) => value + 1);
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }
  return (
    <div className={styles.columns}>
      <div>
        {quoted.state.status === "loading" && (
          <LoadingSkeleton kind="quote" label="Checking current prices and availability…" />
        )}
        {quoted.state.status === "failed" && (
          <p className={styles.warning} role="alert">
            {quoteErrors[quoted.state.kind]}
          </p>
        )}
        {quoted.state.status === "ready" && <CheckoutSummary quote={quoted.state.data} />}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setError("");
              quoted.retry();
            }}
            disabled={submitting}
          >
            Refresh prices
          </button>
          <Link className={styles.textLink} to="/cart">
            Edit cart
          </Link>
        </div>
      </div>
      <aside className={styles.card} aria-labelledby="checkout-payment-title">
        <h2 id="checkout-payment-title">Complete your order</h2>
        {account.state.status === "loading" && (
          <LoadingSkeleton kind="account" label="Checking your account…" />
        )}
        {account.state.status === "failed" && (
          <div role="alert" className={styles.warning}>
            <p>{accountErrors[account.state.kind]}</p>
            <button type="button" className={styles.secondary} onClick={account.retry}>
              Try again
            </button>
          </div>
        )}
        {account.state.status === "ready" && buyer === null && (
          <div className={styles.signIn}>
            <p>Sign in to place your order. Your cart will be here when you return.</p>
            <Link className={styles.primary} to="/sign-in?next=%2Fcheckout">
              Sign in
            </Link>
            <Link className={styles.textLink} to="/register?next=%2Fcheckout">
              Create an account
            </Link>
          </div>
        )}
        {buyer !== null && (
          <>
            <p className={styles.buyer}>
              Ordering as <strong>{buyer.displayName}</strong>
            </p>
            {pending && (
              <div className={styles.warning} role="status">
                <p>
                  An earlier order attempt is awaiting confirmation. Retrying it will use the
                  original items and prices, without placing a duplicate order.
                </p>
                {!attemptMatchesCart(pending, lines) && (
                  <p>
                    Your cart has changed since that attempt. Resolve it before placing a new order.
                  </p>
                )}
              </div>
            )}
            {!pending &&
              quoted.state.status === "ready" &&
              quoted.state.data.totalCents === null && (
                <p>Check your unavailable items before continuing.</p>
              )}
            <p className={styles.notice}>Simulated purchase — no payment is taken.</p>
            {error && (
              <p role="alert" className={styles.warning}>
                {error}
              </p>
            )}
            <button
              type="button"
              className={styles.primary}
              disabled={submitting || (!canPlace && !canRetry)}
              onClick={() => void submit()}
            >
              {submitting
                ? "Confirming your order…"
                : pending
                  ? "Retry previous order"
                  : "Place order"}
            </button>
            <p className={styles.footnote}>
              You will receive your order reference once the purchase is confirmed.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

export function CheckoutPage() {
  const lines = useCart();
  const identity = lines.map((line) => line.offerId + ":" + line.slug).join("|");
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Secure checkout</p>
        <h1>Checkout</h1>
        <p>Review your seller offers and confirm your order.</p>
      </header>
      {lines.length === 0 ? (
        <div className={styles.card}>
          <h2>Your cart is empty</h2>
          <p>Add a game to your cart to continue.</p>
          <Link className={styles.primary} to="/catalog">
            Browse games
          </Link>
        </div>
      ) : (
        <CheckoutContent key={identity} lines={lines} />
      )}
    </div>
  );
}

export function CheckoutConfirmationPage() {
  const location = useLocation();
  const result = readCheckoutConfirmation() ?? parseCheckoutConfirmation(location.state);
  // Legacy receipts only supply a destination. Ownership and every displayed
  // receipt field are resolved again by the authenticated order API.
  return <Navigate replace to={result ? "/orders/" + result.orderId : "/orders"} />;
}
