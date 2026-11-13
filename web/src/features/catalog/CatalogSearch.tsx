import { useEffect, useMemo, useRef, type ChangeEvent, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  catalogHref,
  defaultCatalogQuery,
  parseCatalogSearch,
  type CatalogQuery,
} from "./catalog-query";
import styles from "./CatalogSearch.module.css";

const DEBOUNCE_MS = 350;

function searchTarget(query: CatalogQuery, text: string): string {
  const q = text.trim();
  return catalogHref({ ...query, q, page: 1, sort: q ? "relevance" : "name_asc" });
}

export function CatalogSearch() {
  const location = useLocation();
  const navigate = useNavigate();
  const parsed = useMemo(
    () => parseCatalogSearch(location.pathname === "/catalog" ? location.search : ""),
    [location.pathname, location.search],
  );
  const query = parsed.ok ? parsed.query : defaultCatalogQuery();
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<number | null>(null);
  const internalNavigation = useRef<string | null>(null);

  function cancelPending() {
    if (pending.current !== null) {
      window.clearTimeout(pending.current);
      pending.current = null;
    }
  }

  // Back/Forward and filter navigation restore the applied URL state.
  // Our own debounced navigation must not erase typing done after the request
  // was scheduled but before the router committed the previous query.
  useEffect(() => {
    const href = location.pathname + location.search;
    const fromThisInput = internalNavigation.current === href;
    internalNavigation.current = null;
    if (fromThisInput) return;
    if (pending.current !== null) {
      window.clearTimeout(pending.current);
      pending.current = null;
    }
    if (input.current && input.current.value !== query.q) {
      input.current.value = query.q;
    }
  }, [location.pathname, location.search, query.q]);

  useEffect(() => {
    return () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    };
  }, []);

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    cancelPending();
    if (location.pathname !== "/catalog") return;
    const text = event.currentTarget.value;
    const href = searchTarget(query, text);
    if (href === location.pathname + location.search) return;
    pending.current = window.setTimeout(() => {
      pending.current = null;
      internalNavigation.current = href;
      navigate(href);
    }, DEBOUNCE_MS);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    cancelPending();
    const href = searchTarget(query, input.current?.value ?? "");
    if (href !== location.pathname + location.search) {
      internalNavigation.current = href;
      navigate(href);
    }
  }

  return (
    <form onSubmit={onSubmit} role="search" className={styles.search}>
      <label htmlFor="global-game-search" className={styles.visuallyHidden}>
        Search games
      </label>
      <input
        ref={input}
        id="global-game-search"
        type="search"
        placeholder="Search games"
        autoComplete="off"
        maxLength={100}
        defaultValue={query.q}
        onChange={onInputChange}
      />
      <button type="submit" aria-label="Search games">
        <span aria-hidden="true">⌕</span>
        <span className={styles.searchButtonText}>Search</span>
      </button>
    </form>
  );
}
