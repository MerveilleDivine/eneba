import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { CatalogFilters, CatalogSort } from "./CatalogFilters";
import { ProductCard } from "./ProductCard";
import { CatalogRequestError, fetchCatalog, type CatalogPageData } from "./catalog-api";
import {
  catalogHref,
  catalogRequestPath,
  defaultCatalogQuery,
  parseCatalogSearch,
  type CatalogQuery,
} from "./catalog-query";
import styles from "./CatalogPage.module.css";

type RequestState =
  | { key: string; status: "loading" }
  | { key: string; status: "ready"; data: CatalogPageData }
  | { key: string; status: "failed"; message: string };

export function CatalogPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const parsed = useMemo(() => parseCatalogSearch(location.search), [location.search]);
  const requestKey = parsed.ok ? catalogRequestPath(parsed.query) : "invalid:" + location.search;
  const [request, setRequest] = useState<RequestState>({ key: "", status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!parsed.ok) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6000);
    let current = true;
    void fetchCatalog(parsed.query, controller.signal)
      .then((data) => {
        if (current) setRequest({ key: requestKey, status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!current) return;
        const message =
          error instanceof CatalogRequestError && error.kind === "invalid"
            ? "The selected filters could not be applied. Please adjust them and try again."
            : "We couldn't load the games right now. Please try again.";
        setRequest({ key: requestKey, status: "failed", message });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      current = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [parsed, requestKey, attempt]);

  function changeQuery(query: CatalogQuery) {
    navigate(catalogHref(query));
  }

  const active =
    request.key === requestKey ? request : ({ key: requestKey, status: "loading" } as const);
  const query = parsed.ok ? parsed.query : defaultCatalogQuery();
  const result = active.status === "ready" ? active.data : null;
  const pages = result ? Math.ceil(result.total / result.pageSize) : 0;
  const showPrevious = result !== null && query.page > 1;
  const showNext = result !== null && query.page < pages;

  return (
    <div className={styles.catalogPage}>
      <section className={styles.intro} aria-labelledby="catalog-title">
        <p className={styles.eyebrow}>Find your next adventure</p>
        <h1 id="catalog-title">Explore games</h1>
        <p>
          Find a world worth getting lost in. Explore fictional demo titles across your favorite
          platforms.
        </p>
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
            key={String(query.minPriceCents) + ":" + String(query.maxPriceCents)}
            query={query}
            onChange={changeQuery}
            onClear={() => navigate("/catalog")}
          />
          <section className={styles.results} aria-label="Game results">
            <div className={styles.resultsToolbar}>
              <div>
                <h2>Browse games</h2>
                <p aria-live="polite" aria-atomic="true" className={styles.count}>
                  {result
                    ? result.total + (result.total === 1 ? " game" : " games")
                    : "Discover games"}
                </p>
              </div>
              <CatalogSort query={query} onChange={changeQuery} />
            </div>
            {active.status === "loading" && (
              <div role="status" className={styles.loadingArea}>
                <p>Loading games…</p>
                <div className={styles.grid} aria-hidden="true">
                  {Array.from({ length: 6 }, (_, index) => (
                    <div key={index} className={styles.skeleton} />
                  ))}
                </div>
              </div>
            )}
            {active.status === "failed" && (
              <section className={styles.feedback} role="alert">
                <h3>Games are temporarily unavailable</h3>
                <p>{active.message}</p>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => {
                    setRequest({ key: requestKey, status: "loading" });
                    setAttempt((value) => value + 1);
                  }}
                >
                  Try again
                </button>
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
                  to={query.page > 1 ? catalogHref({ ...query, page: 1 }) : "/catalog"}
                >
                  {query.page > 1 ? "First page" : "Clear filters"}
                </Link>
              </section>
            )}
            {result && result.items.length > 0 && (
              <div className={styles.grid}>
                {result.items.map((product, index) => (
                  <ProductCard key={product.id} product={product} position={index} />
                ))}
              </div>
            )}
            {result && pages > 1 && (
              <nav aria-label="Catalog pages" className={styles.pagination}>
                {showPrevious ? (
                  <Link to={catalogHref({ ...query, page: query.page - 1 })}>Previous</Link>
                ) : (
                  <span aria-disabled="true">Previous</span>
                )}
                <span>
                  Page {query.page} of {pages}
                </span>
                {showNext ? (
                  <Link to={catalogHref({ ...query, page: query.page + 1 })}>Next</Link>
                ) : (
                  <span aria-disabled="true">Next</span>
                )}
              </nav>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
