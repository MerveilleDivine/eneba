import { useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { CatalogFilters, CatalogSort } from "./CatalogFilters";
import { ProductCard } from "../../shared/product/ProductCard";
import { useReadRequest } from "../../shared/api/use-read-request";
import { CatalogRequestError, fetchCatalog, type CatalogFailureKind } from "./catalog-api";
import {
  catalogHref,
  catalogRequestPath,
  defaultCatalogQuery,
  parseCatalogSearch,
  type CatalogQuery,
} from "./catalog-query";
import styles from "./CatalogPage.module.css";

const failureMessages: Record<CatalogFailureKind, { title: string; description: string }> = {
  invalid: {
    title: "Those filters couldn't be applied",
    description: "The catalog couldn't use this selection. Change the filters or reset them.",
  },
  unavailable: {
    title: "Games are temporarily unavailable",
    description: "The catalog service isn't available right now. Please try again shortly.",
  },
  unexpected: {
    title: "We couldn't load the games",
    description: "Something went wrong while loading the catalog. Please try again.",
  },
  network: {
    title: "Connection problem",
    description: "We couldn't reach the catalog. Check your connection and try again.",
  },
  timeout: {
    title: "The catalog took too long to respond",
    description: "The service didn't respond in time. Please try again.",
  },
};

type ResultsProps = {
  query: CatalogQuery;
  onAction: (event?: MouseEvent<HTMLAnchorElement>) => void;
};

function CatalogResults({ query, onAction }: ResultsProps) {
  // The parent key changes whenever the canonical request changes.
  // Keep this query stable when only the URL spelling changes.
  const [requestQuery] = useState(query);
  const { state: request, retry } = useReadRequest({
    read: (signal) => fetchCatalog(requestQuery, signal),
    failure: (error): CatalogFailureKind =>
      error instanceof CatalogRequestError ? error.kind : "unexpected",
    timeout: "timeout" as CatalogFailureKind,
  });

  const result = request.status === "ready" ? request.data : null;
  const pages = result ? Math.ceil(result.total / result.pageSize) : 0;
  const showPrevious = result !== null && query.page > 1;
  const showNext = result !== null && query.page < pages;
  const failure = request.status === "failed" ? failureMessages[request.kind] : null;
  const canReset =
    request.status === "failed" && request.kind === "invalid" && catalogHref(query) !== "/catalog";

  return (
    <div>
      <p aria-live="polite" aria-atomic="true" className={styles.count}>
        {result ? result.total + (result.total === 1 ? " game" : " games") : "Discover games"}
      </p>
      {request.status === "loading" && (
        <div role="status" className={styles.loadingArea}>
          <p>Loading games…</p>
          <div className={styles.grid} aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className={styles.skeleton} />
            ))}
          </div>
        </div>
      )}
      {request.status === "failed" && failure && (
        <section className={styles.feedback} role="alert">
          <h3>
            {request.kind === "invalid" && !canReset
              ? "We couldn't open the catalog"
              : failure.title}
          </h3>
          <p>
            {request.kind === "invalid" && !canReset
              ? "We couldn't load the catalog. Try again, or choose a platform or search to continue browsing."
              : failure.description}
          </p>
          <div className={styles.failureActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                onAction();
                retry();
              }}
            >
              Try again
            </button>
            {canReset && (
              <Link className={styles.primaryLink} to="/catalog" onClick={onAction}>
                Reset filters
              </Link>
            )}
          </div>
        </section>
      )}
      {result && result.items.length === 0 && (
        <section className={styles.feedback} role="status">
          <h3>{query.page > 1 ? "Nothing on this page" : "No games match those filters"}</h3>
          <p>
            {query.page > 1
              ? "Try an earlier page to continue browsing."
              : "Try another search or clear the filters to see more games."}
          </p>
          <Link
            className={styles.primaryLink}
            onClick={onAction}
            to={query.page > 1 ? catalogHref({ ...query, page: 1 }) : "/catalog"}
          >
            {query.page > 1 ? "First page" : "Clear filters"}
          </Link>
        </section>
      )}
      {result && result.items.length > 0 && (
        <div className={styles.grid}>
          {result.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
      {result && pages > 1 && (
        <nav aria-label="Catalog pages" className={styles.pagination}>
          {showPrevious ? (
            <Link to={catalogHref({ ...query, page: query.page - 1 })} onClick={onAction}>
              Previous
            </Link>
          ) : (
            <span aria-disabled="true">Previous</span>
          )}
          <span>
            Page {query.page} of {pages}
          </span>
          {showNext ? (
            <Link to={catalogHref({ ...query, page: query.page + 1 })} onClick={onAction}>
              Next
            </Link>
          ) : (
            <span aria-disabled="true">Next</span>
          )}
        </nav>
      )}
    </div>
  );
}

export function CatalogPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const parsed = useMemo(() => parseCatalogSearch(location.search), [location.search]);

  function changeQuery(query: CatalogQuery) {
    navigate(catalogHref(query));
  }

  function focusResults(event?: MouseEvent<HTMLAnchorElement>) {
    // A modified link opens another tab/window; leave this page's focus alone.
    if (
      event &&
      (event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey)
    )
      return;
    resultsHeading.current?.focus();
  }

  const query = parsed.ok ? parsed.query : defaultCatalogQuery();

  return (
    <div className={styles.catalogPage}>
      <section className={styles.intro} aria-labelledby="catalog-title">
        <p className={styles.eyebrow}>Find your next adventure</p>
        <h1 id="catalog-title">Explore games</h1>
        <p>Explore new worlds, compare editions and find games for your favorite platforms.</p>
      </section>
      {!parsed.ok ? (
        <section className={styles.feedback} role="alert">
          <h2>We couldn't read this catalog link.</h2>
          <p>{parsed.message}</p>
          <Link to="/catalog" className={styles.primaryLink}>
            Reset catalog
          </Link>
        </section>
      ) : (
        <div className={styles.browseLayout}>
          <CatalogFilters
            query={query}
            onChange={changeQuery}
            onClear={() => navigate("/catalog")}
          />
          <section className={styles.results} aria-label="Game results">
            <div className={styles.resultsToolbar}>
              <h2 ref={resultsHeading} tabIndex={-1}>
                Browse games
              </h2>
              <CatalogSort query={query} onChange={changeQuery} />
            </div>
            <CatalogResults key={catalogRequestPath(query)} query={query} onAction={focusResults} />
          </section>
        </div>
      )}
    </div>
  );
}
