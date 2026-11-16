import { useState } from "react";
import { Link } from "react-router";
import { useReadRequest } from "../../shared/api/use-read-request";
import { displayEuro } from "../../shared/format/money";
import { productHref } from "../../shared/navigation/product-links";
import { platformLabels, regionLabels } from "../../shared/product/identity";
import { fetchProduct, ProductRequestError, type ProductDetails } from "../product/product-api";
import { removeCartLine, useCart, type CartLine } from "./cart-store";
import styles from "./CartPage.module.css";

type CurrentProduct = {
  slug: string;
  details: ProductDetails | null;
  missing: boolean;
  failed: boolean;
};
type CartFailure = "timeout";
type CartItemState = {
  line: CartLine;
  product: ProductDetails | null;
  offer: ProductDetails["offers"][number] | null;
  missing: boolean;
};

async function readProducts(lines: readonly CartLine[], signal: AbortSignal) {
  const slugs = [...new Set(lines.map((line) => line.slug))];
  return Promise.all(
    slugs.map(async (slug): Promise<CurrentProduct> => {
      try {
        return { slug, details: await fetchProduct(slug, signal), missing: false, failed: false };
      } catch (error) {
        if (signal.aborted) throw error;
        const missing = error instanceof ProductRequestError && error.kind === "not-found";
        return { slug, details: null, missing, failed: !missing };
      }
    }),
  );
}

function CartItems({ lines }: { lines: readonly CartLine[] }) {
  const [storageError, setStorageError] = useState(false);
  const { state, retry } = useReadRequest({
    read: (signal) => readProducts(lines, signal),
    failure: () => "timeout" as CartFailure,
    timeout: "timeout" as CartFailure,
  });

  const products = state.status === "ready" ? state.data : [];
  const hasUnverifiedProducts = products.some((product) => product.failed);
  const rows: CartItemState[] = lines.map((line) => {
    const match = products.find((item) => item.slug === line.slug);
    const product = match?.details ?? null;
    const offer = product?.offers.find((item) => item.offerId === line.offerId) ?? null;
    return { line, product, offer, missing: Boolean(match?.missing) };
  });
  const allAvailable = state.status === "ready" && rows.every(
    (row) => row.product !== null && row.offer?.available === true,
  );
  const subtotal = allAvailable
    ? rows.reduce((total, row) => total + (row.offer?.priceCents ?? 0), 0)
    : null;

  function remove(offerId: string) {
    setStorageError(!removeCartLine(offerId));
  }

  return (
    <>
      <div className={styles.toolbar}>
        <p>
          {lines.length} {lines.length === 1 ? "offer" : "offers"} · One key per offer
        </p>
        <button type="button" onClick={retry}>Refresh current offers</button>
      </div>
      {storageError && (
        <p role="alert" className={styles.warning}>
          We couldn't update the saved cart. Check your browser's storage settings and try again.
        </p>
      )}
      {state.status === "loading" && <p role="status">Checking seller prices and availability…</p>}
      {state.status === "failed" && (
        <p role="alert" className={styles.warning}>
          We couldn't check current seller offers. Refresh the offers to try again.
        </p>
      )}
      {hasUnverifiedProducts && (
        <p role="alert" className={styles.warning}>
          Some current seller offers could not be verified. Refresh current offers to try again.
        </p>
      )}
      <ul className={styles.items}>
        {rows.map(({ line, product, offer, missing }) => (
          <li className={styles.item} key={line.offerId}>
            <div className={styles.itemInfo}>
              <h2>{product?.product.name ?? "Saved seller offer"}</h2>
              {product && (
                <p>
                  {product.product.edition} edition · {platformLabels[product.product.platform]} ·{" "}
                  {regionLabels[product.product.region]}
                </p>
              )}
              {offer ? (
                <>
                  <p>Seller: <strong>{offer.sellerName}</strong> · {offer.sellerRatingPercent}% positive</p>
                  <p className={offer.available ? styles.available : styles.warning}>
                    {offer.available ? "Currently available" : "Sold out — cannot be purchased"}
                  </p>
                </>
              ) : (
                <p className={styles.warning}>
                  {missing
                    ? "This game is no longer listed."
                    : state.status === "ready" && product
                      ? "This seller offer is no longer listed for this game."
                      : "Current offer details could not be verified."}
                </p>
              )}
              <p>Quantity: 1</p>
              <Link to={productHref(line.slug, line.offerId)}>View seller offer</Link>
            </div>
            <div className={styles.itemActions}>
              {offer && <strong>{displayEuro(offer.priceCents)}</strong>}
              <button type="button" onClick={() => remove(line.offerId)}>
                Remove offer
              </button>
            </div>
          </li>
        ))}
      </ul>
      <section className={styles.summary} aria-labelledby="summary-title">
        <h2 id="summary-title">Cart summary</h2>
        {subtotal !== null && Number.isSafeInteger(subtotal) ? (
          <p className={styles.subtotal}>
            <span>Current estimated subtotal</span>
            <strong>{displayEuro(subtotal)}</strong>
          </p>
        ) : (
          <p role="status">
            A complete subtotal is unavailable until all saved seller offers are available.
          </p>
        )}
        <p>
          This is a nonbinding display of current prices, not a server quote or stock
          reservation. The final price and inventory must be checked during checkout.
        </p>
        <p>Simulated checkout is part of the upcoming purchasing slice.</p>
        <Link className={styles.browse} to="/catalog">Continue browsing</Link>
      </section>
    </>
  );
}

export function CartPage() {
  const lines = useCart();
  const identity = lines.map((line) => line.slug + ":" + line.offerId).join("|");
  return (
    <div className={styles.page}>
      <header>
        <p className={styles.kicker}>Your selections</p>
        <h1>Shopping cart</h1>
        <p>Compare saved seller offers before proceeding with a simulated purchase.</p>
      </header>
      {lines.length === 0 ? (
        <section className={styles.empty}>
          <h2>Your cart is empty</h2>
          <p>Browse games, choose a seller, and add its offer to your cart.</p>
          <Link className={styles.browse} to="/catalog">Browse games</Link>
        </section>
      ) : (
        <CartItems key={identity} lines={lines} />
      )}
    </div>
  );
}
