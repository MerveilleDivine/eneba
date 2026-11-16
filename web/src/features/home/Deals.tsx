import { Link } from "react-router";
import { DealCard } from "./DealCard";
import { fetchDeals } from "./deals-api";
import { useHomeRequest } from "./use-home-request";
import { useHomeRetryFocus } from "./use-home-retry-focus";
import styles from "./Deals.module.css";

export function Deals() {
  const { state, retry } = useHomeRequest(fetchDeals);
  const { sectionRef, headingRef, retrySection } = useHomeRetryFocus(state.status, retry);

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby="deals-title"
      aria-busy={state.status === "loading"}
      className={styles.section}
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Featured offers</p>
          <h2 id="deals-title" ref={headingRef} tabIndex={-1}>
            Deals worth discovering
          </h2>
          <p>Browse standout prices from different sellers.</p>
        </div>
        <Link className={styles.catalogLink} to="/catalog">
          Browse all games
        </Link>
      </div>
      {state.status === "loading" && (
        <div className={styles.feedback} role="status">
          <p>Loading deals…</p>
          <div className={styles.grid} aria-hidden="true">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className={styles.skeleton} />
            ))}
          </div>
        </div>
      )}
      {state.status === "failed" && (
        <div className={styles.feedback} role="alert">
          <h3>
            {state.kind === "timeout"
              ? "Deals took too long to load"
              : "Deals are temporarily unavailable"}
          </h3>
          <p>The rest of the homepage and the catalog are still available.</p>
          <button type="button" className={styles.retry} onClick={retrySection}>
            Try deals again
          </button>
        </div>
      )}
      {state.status === "ready" && state.data.items.length === 0 && (
        <div className={styles.feedback} role="status">
          <p>There are no featured deals right now. Explore the catalog instead.</p>
        </div>
      )}
      {state.status === "ready" && state.data.items.length > 0 && (
        <>
          <ul className={styles.grid}>
            {state.data.items.map((deal) => (
              <DealCard key={deal.offerId} deal={deal} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
