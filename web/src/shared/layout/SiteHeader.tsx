import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  catalogHref, defaultCatalogQuery, parseCatalogSearch, type CatalogQuery,
} from "../../features/catalog/catalog-query";
import styles from "./SiteHeader.module.css";

type SearchProps = {
  initialQuery: string;
  baseQuery: CatalogQuery;
  onCatalog: boolean;
};

function HeaderSearch({ initialQuery, baseQuery, onCatalog }: SearchProps) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initialQuery);
  const [edited, setEdited] = useState(false);

  const applySearch = useCallback((text: string) => {
    const q = text.trim();
    navigate(catalogHref({
      ...baseQuery, q, page: 1, sort: q ? "relevance" : "name_asc",
    }));
  }, [baseQuery, navigate]);

  useEffect(() => {
    if (!edited || !onCatalog) return;
    const timeout = window.setTimeout(() => {
      applySearch(draft);
      setEdited(false);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [draft, edited, onCatalog, applySearch]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEdited(false);
    applySearch(draft);
  }

  return (
    <form onSubmit={submit} role="search" className={styles.search}>
      <label htmlFor="global-game-search" className={styles.visuallyHidden}>Search games</label>
      <input
        id="global-game-search"
        type="search"
        placeholder="Search games"
        autoComplete="off"
        maxLength={100}
        value={draft}
        onChange={(event) => { setDraft(event.target.value); setEdited(true); }}
      />
      <button type="submit" aria-label="Search games">
        <span aria-hidden="true">⌕</span>
        <span className={styles.searchButtonText}>Search</span>
      </button>
    </form>
  );
}

export function SiteHeader() {
  const location = useLocation();
  const parsed = useMemo(
    () => parseCatalogSearch(location.pathname === "/catalog" ? location.search : ""),
    [location.pathname, location.search],
  );
  const baseQuery = parsed.ok ? parsed.query : defaultCatalogQuery();
  const currentQuery = baseQuery.q;

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} to="/catalog" aria-label="Eneba demo catalog">
          <span className={styles.brandMark} aria-hidden="true">e</span>
          <span>eneba<span className={styles.brandDot}>.</span></span>
        </Link>
        <HeaderSearch
          key={location.pathname + ":" + currentQuery}
          initialQuery={currentQuery}
          baseQuery={baseQuery}
          onCatalog={location.pathname === "/catalog"}
        />
        <nav aria-label="Main navigation" className={styles.navigation}>
          <Link to="/catalog" aria-current={location.pathname === "/catalog" ? "page" : undefined}>Browse games</Link>
        </nav>
      </div>
      <div className={styles.demoStrip}>
        <span>Unofficial demo</span>
        <span aria-hidden="true">·</span>
        <span>Digital games, simulated purchases</span>
      </div>
    </header>
  );
}
