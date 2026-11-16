import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router";
import { useReadRequest } from "../../shared/api/use-read-request";
import { LoadingSkeleton } from "../../shared/loading/LoadingSkeleton";
import { displayEuro } from "../../shared/format/money";
import { watchSessionChanges } from "../auth/session-events";
import {
  fetchOrder,
  fetchOrders,
  OrderRequestError,
  type OrderFailure,
  type OrderItem,
} from "./orders-api";
import styles from "./OrdersPage.module.css";

function useProtectedSession() {
  const [session, setSession] = useState({
    revision: 0,
    visible: document.visibilityState !== "hidden",
  });
  useEffect(
    () =>
      watchSessionChanges(() =>
        setSession((previous) => ({
          revision: previous.revision + 1,
          visible: document.visibilityState !== "hidden",
        })),
      ),
    [],
  );
  return session;
}

function failure(error: unknown): OrderFailure {
  return error instanceof OrderRequestError ? error.kind : "unexpected";
}
function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date(value));
}

function OrderError({ kind, retry }: { kind: OrderFailure; retry: () => void }) {
  const location = useLocation();
  const signIn = "/sign-in?next=" + encodeURIComponent(location.pathname);
  if (kind === "unauthorized")
    return (
      <div className={styles.panel}>
        <h2>Sign in to view your orders</h2>
        <p>Your purchases and keys are available in the purchasing account.</p>
        <Link className={styles.primary} to={signIn}>
          Sign in
        </Link>
      </div>
    );
  if (kind === "missing")
    return (
      <div className={styles.panel}>
        <h2>Order unavailable</h2>
        <p>We couldn't find this order in your account.</p>
        <Link className={styles.secondary} to="/orders">
          View your orders
        </Link>
      </div>
    );
  return (
    <div className={styles.panel} role="alert">
      <h2>Orders temporarily unavailable</h2>
      <p>We couldn't load your orders. Please try again.</p>
      <button className={styles.secondary} onClick={retry} type="button">
        Try again
      </button>
    </div>
  );
}

function OrderList({ page }: { page: number }) {
  const { state, retry } = useReadRequest({
    read: (signal) => fetchOrders(page, signal),
    failure,
    timeout: "unavailable" as OrderFailure,
  });
  if (state.status === "loading")
    return <LoadingSkeleton kind="orders" label="Loading your orders…" />;
  if (state.status === "failed") return <OrderError kind={state.kind} retry={retry} />;
  const { items, total, pageSize } = state.data;
  return (
    <>
      {items.length === 0 ? (
        <div className={styles.panel}>
          <h2>{total === 0 ? "Your next adventure starts here" : "No orders on this page"}</h2>
          <p>
            {total === 0
              ? "Once you buy a game, your receipt and key will appear here."
              : "Return to the first page to see your purchases."}
          </p>
          <Link className={styles.primary} to={total === 0 ? "/catalog" : "/orders"}>
            {total === 0 ? "Explore games" : "First page"}
          </Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((order) => (
            <li key={order.id} className={styles.order}>
              <div>
                <p className={styles.kicker}>
                  Order confirmed · <time dateTime={order.createdAt}>{date(order.createdAt)}</time>
                </p>
                <h2>
                  {order.itemCount} {order.itemCount === 1 ? "game" : "games"}
                </h2>
                <p className={styles.reference}>{order.id}</p>
              </div>
              <div className={styles.orderAction}>
                <strong>{displayEuro(order.totalCents)}</strong>
                <Link className={styles.primary} to={`/orders/${order.id}`}>
                  View order & keys
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      {total > pageSize && (
        <nav className={styles.pagination} aria-label="Order pages">
          {page > 1 && (
            <Link className={styles.secondary} to={`/orders?page=${page - 1}`}>
              Previous
            </Link>
          )}
          <span>
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          {page * pageSize < total && (
            <Link className={styles.secondary} to={`/orders?page=${page + 1}`}>
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

export function OrdersPage() {
  const [search] = useSearchParams();
  const requested = Number(search.get("page") ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const session = useProtectedSession();
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Your library</p>
        <h1>Orders & keys</h1>
        <p>All your purchases, ready when you are.</p>
      </header>
      {session.visible ? (
        <OrderList key={`${page}:${session.revision}`} page={page} />
      ) : (
        <p role="status">Your orders will refresh when you return.</p>
      )}
    </section>
  );
}

function DeliveredKey({ item }: { item: OrderItem }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [copying, setCopying] = useState(false);
  async function copy() {
    setCopying(true);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(item.keyCode);
      setMessage("Key copied to clipboard.");
    } catch {
      input.current?.focus();
      input.current?.select();
      setMessage("Copy wasn't available. The key is selected; use your device's copy command.");
    } finally {
      setCopying(false);
    }
  }
  return (
    <div className={styles.delivery}>
      <label htmlFor={`key-${item.id}`}>Nonredeemable key</label>
      <div className={styles.keyRow}>
        <input
          ref={input}
          id={`key-${item.id}`}
          value={item.keyCode}
          readOnly
          spellCheck={false}
          autoComplete="off"
        />
        <button
          className={styles.secondary}
          type="button"
          onClick={() => void copy()}
          disabled={copying}
        >
          {copying ? "Copying…" : "Copy key"}
        </button>
      </div>
      <p className={styles.copyStatus} role="status">
        {message}
      </p>
    </div>
  );
}

function OrderReceipt({ id }: { id: string }) {
  const location = useLocation();
  const { state, retry } = useReadRequest({
    read: (signal) => fetchOrder(id, signal),
    failure,
    timeout: "unavailable" as OrderFailure,
  });
  if (state.status === "loading")
    return <LoadingSkeleton kind="receipt" label="Loading your order…" />;
  if (state.status === "failed") return <OrderError kind={state.kind} retry={retry} />;
  const order = state.data;
  const cartWarning =
    typeof location.state === "object" &&
    location.state !== null &&
    "cartCleared" in location.state &&
    location.state.cartCleared === false;
  return (
    <>
      <div className={styles.receipt}>
        <div>
          <span className={styles.kicker}>Order reference</span>
          <p className={styles.reference}>{order.id}</p>
          <time dateTime={order.createdAt}>{date(order.createdAt)}</time>
        </div>
        <div className={styles.total}>
          <span>Order total</span>
          <strong>{displayEuro(order.totalCents)}</strong>
        </div>
      </div>
      {cartWarning && (
        <p role="alert">
          Your order was placed, but we couldn't update your cart. Remove the purchased items before
          ordering again.
        </p>
      )}
      <p className={styles.notice}>These keys cannot be redeemed or activated.</p>
      <ul className={styles.list}>
        {order.items.map((item) => (
          <li key={item.id} className={styles.panel}>
            <div className={styles.itemHeading}>
              <div>
                <h2>{item.productName}</h2>
                <p>Sold by {item.sellerName}</p>
              </div>
              <strong>{displayEuro(item.unitPriceCents)}</strong>
            </div>
            <DeliveredKey item={item} />
          </li>
        ))}
      </ul>
      <Link className={styles.secondary} to="/catalog">
        Continue shopping
      </Link>
    </>
  );
}

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const session = useProtectedSession();
  // Remounting clears keys and aborts the previous request before a new account
  // or resumed tab may render. A late response cannot repopulate the old owner.
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.back} to="/orders">
          ← All orders
        </Link>
        <p className={styles.kicker}>Your purchases</p>
        <h1>Your order & keys</h1>
      </header>
      {session.visible ? (
        <OrderReceipt key={`${orderId}:${session.revision}`} id={orderId} />
      ) : (
        <p role="status">Your order will refresh when you return.</p>
      )}
    </section>
  );
}
