import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type CompositionEvent,
  type FormEvent,
} from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import {
  CATALOG_SEARCH_MAX_LENGTH,
  catalogHref,
  defaultCatalogQuery,
  parseCatalogSearch,
  type CatalogQuery,
} from "./catalog-query";
import styles from "./CatalogSearch.module.css";

const DEBOUNCE_MS = 350;

function capSearchText(value: string): string {
  return Array.from(value).slice(0, CATALOG_SEARCH_MAX_LENGTH).join("");
}

function searchTarget(query: CatalogQuery, text: string): string {
  const q = text.trim();
  return catalogHref({ ...query, q, page: 1, sort: q ? "relevance" : "name_asc" });
}

export function CatalogSearch() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const fromCatalogSearch = location.state?.fromCatalogSearch === true;
  const parsed = useMemo(
    () => parseCatalogSearch(location.pathname === "/catalog" ? location.search : ""),
    [location.pathname, location.search],
  );
  const query = parsed.ok ? parsed.query : defaultCatalogQuery();
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const pending = useRef<number | null>(null);

  function cancelPending() {
    if (pending.current !== null) {
      window.clearTimeout(pending.current);
      pending.current = null;
    }
  }

  // Only search-triggered PUSH navigation preserves a newer draft. Back/Forward,
  // filters, and ordinary links restore the search from the applied URL.
  useLayoutEffect(() => {
    if (navigationType === "PUSH" && fromCatalogSearch) return;
    if (pending.current !== null) {
      window.clearTimeout(pending.current);
      pending.current = null;
    }
    if (input.current && input.current.value !== query.q) {
      input.current.value = query.q;
    }
  }, [
    fromCatalogSearch,
    location.key,
    location.pathname,
    location.search,
    navigationType,
    query.q,
  ]);

  useEffect(() => {
    return () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    };
  }, []);

  function scheduleSearch(text: string) {
    cancelPending();
    if (composing.current || location.pathname !== "/catalog") return;
    const href = searchTarget(query, text);
    if (href === location.pathname + location.search) return;
    pending.current = window.setTimeout(() => {
      pending.current = null;
      navigate(href, { state: { fromCatalogSearch: true } });
    }, DEBOUNCE_MS);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (composing.current) return;
    const text = capSearchText(event.currentTarget.value);
    if (text !== event.currentTarget.value) event.currentTarget.value = text;
    scheduleSearch(text);
  }

  function onCompositionStart() {
    composing.current = true;
    cancelPending();
  }

  function onCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    composing.current = false;
    const text = capSearchText(event.currentTarget.value);
    if (text !== event.currentTarget.value) event.currentTarget.value = text;
    scheduleSearch(text);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (composing.current) return;
    cancelPending();
    const text = capSearchText(input.current?.value ?? "");
    if (input.current && text !== input.current.value) input.current.value = text;
    const href = searchTarget(query, text);
    if (href !== location.pathname + location.search) {
      navigate(href, { state: { fromCatalogSearch: true } });
    } else if (input.current) {
      // Enter with a logically unchanged query normalizes the visible draft.
      input.current.value = query.q;
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
        defaultValue={query.q}
        onChange={onInputChange}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
      />
      <button type="submit" aria-label="Search games">
        <span aria-hidden="true">⌕</span>
        <span className={styles.searchButtonText}>Search</span>
      </button>
    </form>
  );
}
