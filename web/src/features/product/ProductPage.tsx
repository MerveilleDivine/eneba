import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useNavigationType, useParams } from "react-router";
import { useReadRequest } from "../../shared/api/use-read-request";
import { LoadingSkeleton } from "../../shared/loading/LoadingSkeleton";
import { displayEuro } from "../../shared/format/money";
import { productHref } from "../../shared/navigation/product-links";
import { platformLabels, regionLabels } from "../../shared/product/identity";
import { parseCatalogSearch } from "../catalog/catalog-query";
import { addCartLine, type AddCartResult } from "../cart/cart-store";
import {
  fetchProduct,
  productFailure,
  validProductSlug,
  type ProductFailure,
  type ProductDetails,
} from "./product-api";
import { parseOfferSelection } from "./product-selection";
import styles from "./ProductPage.module.css";

const cartMessages: Record<AddCartResult, string> = {
  added: "Added to cart.",
  "already-added": "Already in your cart.",
  full: "Your cart is full. Remove an item before adding another.",
  "storage-error": "The cart could not be saved. Enable browser storage and try again.",
  invalid: "Couldn't add this item. Refresh the game and try again.",
};

const failures: Record<ProductFailure, { title: string; message: string }> = {
  invalid: {
    title: "This product link is invalid",
    message: "Open a game from the catalog to continue.",
  },
  "not-found": {
    title: "This game is no longer in the catalog",
    message: "It may have been removed. Explore other games instead.",
  },
  unavailable: {
    title: "Product details are temporarily unavailable",
    message: "Please try again shortly. Your offer link is preserved.",
  },
  network: { title: "Connection problem", message: "Check your connection and try again." },
  timeout: {
    title: "Product details took too long to load",
    message: "The service did not respond in time. Please try again.",
  },
  unexpected: {
    title: "We couldn't load this game",
    message: "Something went wrong while loading product details. Please try again.",
  },
};

function returnDestination(state: unknown): string {
  if (
    typeof state !== "object" ||
    state === null ||
    !("from" in state) ||
    typeof state.from !== "string"
  )
    return "/catalog";
  const from = state.from;
  if (from === "/") return "/";
  if (from === "/catalog") return from;
  if (
    !from.startsWith("/catalog?") ||
    from.includes("\\") ||
    from.includes("#") ||
    Array.from(from).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return "/catalog";
  return parseCatalogSearch(from.slice("/catalog".length)).ok ? from : "/catalog";
}

function ProductCover({ product }: { product: ProductDetails["product"] }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return (
    <div className={styles.cover}>
      {failedUrl !== product.coverUrl ? (
        <img
          src={product.coverUrl}
          alt=""
          width="432"
          height="576"
          onError={() => setFailedUrl(product.coverUrl)}
        />
      ) : (
        <div className={styles.coverFallback}>
          <span>Artwork unavailable</span>
          <strong>{product.name}</strong>
        </div>
      )}
    </div>
  );
}

function ProductContent({ slug }: { slug: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigationType();
  const [focusOnArrival] = useState(navigation === "PUSH");
  const heading = useRef<HTMLHeadingElement>(null);
  const sellerHeading = useRef<HTMLHeadingElement>(null);
  const [cartResult, setCartResult] = useState<AddCartResult | null>(null);
  const { state, retry } = useReadRequest({
    read: (signal) => fetchProduct(slug, signal),
    failure: productFailure,
    timeout: "timeout" as ProductFailure,
  });
  useEffect(() => {
    if (focusOnArrival) heading.current?.focus();
  }, [focusOnArrival]);
  const selection = parseOfferSelection(location.search);
  const details = state.status === "ready" ? state.data : null;
  const selected =
    details && selection.valid
      ? details.offers.find((offer) => offer.offerId === selection.offerId)
      : undefined;
  const missingSelection = selection.valid && selection.offerId !== null && details && !selected;
  const returnTo = returnDestination(location.state);
  const failure = state.status === "failed" ? failures[state.kind] : null;

  function choose(offerId?: string) {
    setCartResult(null);
    if (!offerId) sellerHeading.current?.focus();
    navigate(productHref(slug, offerId), { state: location.state, preventScrollReset: true });
  }
  function addSelectedOffer() {
    if (!details || !selected?.available) return;
    const result = addCartLine(details.product.slug, selected.offerId);
    setCartResult(result);
  }
  return (
    <div className={styles.page}>
      <Link className={styles.back} to={returnTo}>
        {returnTo === "/" ? "← Back to home" : "← Back to games"}
      </Link>
      <header className={styles.title}>
        <p className={styles.eyebrow}>Discover · Compare · Choose</p>
        <h1 ref={heading} tabIndex={-1}>
          {details ? details.product.name : "Product details"}
        </h1>
        {details && (
          <p>
            {details.product.edition} edition · {platformLabels[details.product.platform]} ·{" "}
            {regionLabels[details.product.region]}
          </p>
        )}
      </header>
      {state.status === "loading" && (
        <LoadingSkeleton kind="product" label="Loading game and seller offers…" />
      )}
      {failure && (
        <section className={styles.feedback} role="alert">
          <h2>{failure.title}</h2>
          <p>{failure.message}</p>
          {state.status === "failed" && state.kind !== "not-found" && state.kind !== "invalid" && (
            <button
              type="button"
              onClick={() => {
                heading.current?.focus();
                retry();
              }}
            >
              Try product again
            </button>
          )}
          <Link to="/catalog">Browse games</Link>
        </section>
      )}
      {details && (
        <>
          <div className={styles.overview}>
            <ProductCover product={details.product} />
            <section className={styles.information} aria-labelledby="about-game">
              <p className={styles.eyebrow}>Your next world</p>
              <h2 id="about-game">About this game</h2>
              <p className={styles.description}>
                {details.product.description.trim() || "Game details are currently unavailable."}
              </p>
              <dl className={styles.facts}>
                <div>
                  <dt>Edition</dt>
                  <dd>{details.product.edition}</dd>
                </div>
                <div>
                  <dt>Platform</dt>
                  <dd>{platformLabels[details.product.platform]}</dd>
                </div>
                <div>
                  <dt>Region</dt>
                  <dd>{regionLabels[details.product.region]}</dd>
                </div>
                <div>
                  <dt>Format</dt>
                  <dd>Digital code</dd>
                </div>
              </dl>
              <section className={styles.activation} aria-labelledby="activation-title">
                <h3 id="activation-title">Activation instructions</h3>
                <p>{details.product.activationInstructions}</p>
              </section>
              <div className={styles.fromPrice}>
                {details.product.lowestPriceCents !== null ? (
                  <>
                    <span>Available offers from</span>
                    <strong>{displayEuro(details.product.lowestPriceCents)}</strong>
                  </>
                ) : (
                  <strong>Currently sold out</strong>
                )}
              </div>
              <p className={styles.muted}>
                Check the platform, region and edition before choosing a seller.
              </p>
            </section>
          </div>
          <section className={styles.sellers} aria-labelledby="seller-title">
            <div className={styles.sellerHeading}>
              <div>
                <p className={styles.eyebrow}>Available sellers</p>
                <h2 ref={sellerHeading} tabIndex={-1} id="seller-title">
                  Compare seller offers
                </h2>
              </div>
              <span>
                {details.offers.length} {details.offers.length === 1 ? "offer" : "offers"}
              </span>
            </div>
            <p className={styles.muted}>Prices and availability may change until checkout.</p>
            {(!selection.valid || missingSelection || (selected && !selected.available)) && (
              <div role="alert" className={styles.notice}>
                <p>
                  {!selection.valid
                    ? "This offer link is invalid. Choose an available seller below."
                    : missingSelection
                      ? "The linked offer is no longer available for this game. No replacement has been selected."
                      : "The selected seller's offer is sold out. Choose another available seller."}
                </p>
                <button type="button" onClick={() => choose()}>
                  Clear offer selection
                </button>
              </div>
            )}
            {details.offers.length === 0 ? (
              <div className={styles.feedback} role="status">
                <h3>No active seller offers</h3>
                <p>
                  This game has no seller offers right now. Browse other games or check again later.
                </p>
              </div>
            ) : (
              <fieldset className={styles.offers}>
                <legend className={styles.legend}>Choose a seller offer</legend>
                {details.offers.map((offer) => (
                  <label
                    key={offer.offerId}
                    className={`${styles.offer} ${selected?.offerId === offer.offerId ? styles.selected : ""}`}
                  >
                    <input
                      type="radio"
                      name="seller-offer"
                      value={offer.offerId}
                      checked={selected?.offerId === offer.offerId}
                      disabled={!offer.available}
                      onChange={() => choose(offer.offerId)}
                    />
                    <span className={styles.sellerIdentity}>
                      <strong>{offer.sellerName}</strong>
                      <span>{offer.sellerRatingPercent}% positive</span>
                      <span className={offer.available ? styles.available : styles.muted}>
                        {offer.available ? "Available" : "Sold out"}
                      </span>
                    </span>
                    <span className={styles.offerPrice}>
                      <strong>{displayEuro(offer.priceCents)}</strong>
                      {offer.listPriceCents !== null && (
                        <span>
                          List price <del>{displayEuro(offer.listPriceCents)}</del>
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <div
              className={styles.selection}
              aria-label="Your seller choice"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <h3>Your seller choice</h3>
              {selected?.available ? (
                <>
                  <p>
                    <strong>{selected.sellerName}</strong> · {details.product.edition} edition
                  </p>
                  <p className={styles.selectedPrice}>{displayEuro(selected.priceCents)}</p>
                  <div className={styles.selectionActions}>
                    <button type="button" className={styles.addToCart} onClick={addSelectedOffer}>
                      Add to cart
                    </button>
                    {(cartResult === "added" || cartResult === "already-added") && (
                      <Link to="/cart">View cart</Link>
                    )}
                    <button type="button" onClick={() => choose()}>
                      Clear offer selection
                    </button>
                  </div>
                  {cartResult && <p role="status">{cartMessages[cartResult]}</p>}
                </>
              ) : (
                <p>
                  {details.offers.some((offer) => offer.available)
                    ? "Choose a seller to add this game to your cart."
                    : "No seller offers are available right now."}
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export function ProductPage() {
  const { slug = "" } = useParams();
  if (!validProductSlug(slug))
    return (
      <section className={styles.page}>
        <h1>This product link is invalid</h1>
        <p>Open a game from the catalog to continue.</p>
        <Link to="/catalog">Browse games</Link>
      </section>
    );
  return <ProductContent key={slug} slug={slug} />;
}
