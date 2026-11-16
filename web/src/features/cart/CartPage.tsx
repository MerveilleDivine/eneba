import { useState } from "react";
import { Link } from "react-router";
import { useReadRequest } from "../../shared/api/use-read-request";
import { displayEuro } from "../../shared/format/money";
import { productHref } from "../../shared/navigation/product-links";
import { platformLabels, regionLabels } from "../../shared/product/identity";
import { removeCartLine, useCart, type CartLine } from "./cart-store";
import {
  fetchCartQuote,
  QuoteRequestError,
  type QuoteFailure,
} from "./quote-api";
import styles from "./CartPage.module.css";

const quoteMessages: Record<QuoteFailure, string> = {
  invalid:
    "Some cart items need attention. Remove the unavailable item and try again.",
  unavailable: "Current prices aren't available right now. Please try again.",
  timeout: "Checking prices is taking longer than usual. Please try again.",
  network: "We couldn't reach the store. Check your connection and try again.",
  unexpected: "We couldn't check your cart. Please try again.",
};

function CartItems({ lines }: { lines: readonly CartLine[] }) {
  const [storageError, setStorageError] = useState(false);
  const { state, retry } = useReadRequest({
    read: (signal) => fetchCartQuote(lines, signal),
    failure: (error): QuoteFailure =>
      error instanceof QuoteRequestError ? error.kind : "unexpected",
    timeout: "timeout" as QuoteFailure,
  });
  const rows = lines.map((line, index) => ({
    line,
    quote: state.status === "ready" ? state.data.lines[index] : null,
  }));
  function remove(offerId: string) {
    setStorageError(!removeCartLine(offerId));
  }
  return (
    <>
      <div className={styles.toolbar}>
        <p>
          {lines.length} {lines.length === 1 ? "item" : "items"}
        </p>
        <button type="button" onClick={retry}>
          Refresh prices
        </button>
      </div>
      {storageError && (
        <p role="alert" className={styles.warning}>
          We couldn't update your cart. Check your browser's storage settings
          and try again.
        </p>
      )}
      {state.status === "loading" && (
        <p role="status">Checking prices and availability…</p>
      )}
      {state.status === "failed" && (
        <p role="alert" className={styles.warning}>
          {quoteMessages[state.kind]}
        </p>
      )}
      <ul className={styles.items}>
        {rows.map(({ line, quote }) => (
          <li className={styles.item} key={line.offerId}>
            <div className={styles.itemInfo}>
              <h2>{quote?.productName ?? "Saved item"}</h2>
              {quote?.edition && quote.platform && quote.region && (
                <p>
                  {quote.edition} edition · {platformLabels[quote.platform]} ·{" "}
                  {regionLabels[quote.region]}
                </p>
              )}
              {quote?.sellerName && (
                <p>
                  Seller: <strong>{quote.sellerName}</strong>
                  {quote.sellerRatingPercent !== null &&
                    " · " + quote.sellerRatingPercent + "% positive"}
                </p>
              )}
              {quote && (
                <p
                  className={
                    quote.available ? styles.available : styles.warning
                  }
                >
                  {quote.available
                    ? "Available"
                    : quote.productName === null
                      ? "This offer is no longer available."
                      : "Sold out"}
                </p>
              )}
              <p>Quantity: 1</p>
              <Link
                to={productHref(quote?.productSlug ?? line.slug, line.offerId)}
              >
                View seller offer
              </Link>
            </div>
            <div className={styles.itemActions}>
              {quote?.unitPriceCents != null && (
                <strong>{displayEuro(quote.unitPriceCents)}</strong>
              )}
              <button type="button" onClick={() => remove(line.offerId)}>
                Remove offer
              </button>
            </div>
          </li>
        ))}
      </ul>
      <section className={styles.summary} aria-labelledby="summary-title">
        <h2 id="summary-title">Cart summary</h2>
        {state.status === "ready" && state.data.totalCents !== null ? (
          <p className={styles.subtotal}>
            <span>Current subtotal</span>
            <strong>{displayEuro(state.data.totalCents)}</strong>
          </p>
        ) : (
          <p role="status">
            {state.status === "ready"
              ? "Remove unavailable items to see your subtotal."
              : "Subtotal will appear when current prices are available."}
          </p>
        )}
        <p>Final prices and availability are confirmed at checkout.</p>
        {state.status === "ready" && state.data.totalCents !== null && (
          <Link className={styles.browse} to="/checkout">
            Proceed to checkout
          </Link>
        )}
        <Link className={styles.browse} to="/catalog">
          Continue browsing
        </Link>
      </section>
    </>
  );
}

export function CartPage() {
  const lines = useCart();
  const identity = lines
    .map((line) => line.slug + ":" + line.offerId)
    .join("|");
  return (
    <div className={styles.page}>
      <header>
        <p className={styles.kicker}>Your selections</p>
        <h1>Shopping cart</h1>
        <p>Review your games and seller offers.</p>
      </header>
      {lines.length === 0 ? (
        <section className={styles.empty}>
          <h2>Your cart is empty</h2>
          <p>Browse games, choose a seller, and add its offer to your cart.</p>
          <Link className={styles.browse} to="/catalog">
            Browse games
          </Link>
        </section>
      ) : (
        <CartItems key={identity} lines={lines} />
      )}
    </div>
  );
}
