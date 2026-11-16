import { Link } from "react-router";
import { ProductCard } from "../../shared/product/ProductCard";
import { fetchBestSellers } from "./best-sellers-api";
import { useHomeRequest } from "./use-home-request";
import { useHomeRetryFocus } from "./use-home-retry-focus";
import styles from "./BestSellers.module.css";

export function BestSellers() {
  const { state, retry } = useHomeRequest(fetchBestSellers);
  const { sectionRef, headingRef, retrySection } = useHomeRetryFocus(state.status, retry);

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby="best-sellers-title"
      aria-busy={state.status === "loading"}
      className={styles.section}
    >
      <div className={styles.heading}>
        <div>
          <h2 id="best-sellers-title" ref={headingRef} tabIndex={-1}>
            Best sellers
          </h2>
        </div>
        <Link className={styles.catalogLink} to="/catalog">
          Browse all games
        </Link>
      </div>
      {state.status === "loading" && (
        <div role="status" className={styles.skeletons}>
          <p>Loading best sellers…</p>
          <div className={styles.grid} aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className={styles.skeleton} />
            ))}
          </div>
        </div>
      )}
      {state.status === "failed" && (
        <div role="alert" className={styles.feedback}>
          <h3>
            {state.kind === "timeout"
              ? "Best sellers took too long to load"
              : "Best sellers are temporarily unavailable"}
          </h3>
          <p>The catalog is still available while this section recovers.</p>
          <button type="button" onClick={retrySection} className={styles.retry}>
            Try best sellers again
          </button>
        </div>
      )}
      {state.status === "ready" && state.data.items.length === 0 && (
        <div role="status" className={styles.feedback}>
          <p>No best sellers are featured right now. Browse the full catalog instead.</p>
        </div>
      )}
      {state.status === "ready" && state.data.items.length > 0 && (
        <ul className={styles.grid}>
          {state.data.items.map((product) => (
            <li key={product.id} className={styles.item}>
              <ProductCard product={product} compact />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
