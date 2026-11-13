import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  catalogHref,
  defaultCatalogQuery,
  parseCatalogSearch,
  type CatalogQuery,
} from "./catalog-query";
import styles from "./CatalogSearch.module.css";

type SearchProps = {
  initialQuery: string;
  baseQuery: CatalogQuery;
  onCatalog: boolean;
};

function HeaderSearch({ initialQuery, baseQuery, onCatalog }: SearchProps) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initialQuery);
  const [edited, setEdited] = useState(false);

  const applySearch = useCallback(
    (text: string) => {
      const q = text.trim();
      navigate(
        catalogHref({
          ...baseQuery,
          q,
          page: 1,
          sort: q ? "relevance" : "name_asc",
        }),
      );
    },
    [baseQuery, navigate],
  );

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
      <label htmlFor="global-game-search" className={styles.visuallyHidden}>
        Search games
      </label>
      <input
        id="global-game-search"
        type="search"
        placeholder="Search games"
        autoComplete="off"
        maxLength={100}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setEdited(true);
        }}
      />
      <button type="submit" aria-label="Search games">
        <span aria-hidden="true">⌕</span>
        <span className={styles.searchButtonText}>Search</span>
      </button>
    </form>
  );
}

export function CatalogSearch() {
  const location = useLocation();
  const parsed = useMemo(
    () => parseCatalogSearch(location.pathname === "/catalog" ? location.search : ""),
    [location.pathname, location.search],
  );
  const baseQuery = parsed.ok ? parsed.query : defaultCatalogQuery();
  const currentQuery = baseQuery.q;

  return (
    <HeaderSearch
      key={location.pathname + ":" + currentQuery}
      initialQuery={currentQuery}
      baseQuery={baseQuery}
      onCatalog={location.pathname === "/catalog"}
    />
  );
}
