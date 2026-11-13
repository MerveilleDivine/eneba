import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type CompositionEvent,
  type FormEvent,
} from "react";
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
  const composing = useRef(false);
  const pending = useRef<number | null>(null);
  const internalNavigation = useRef<string | null>(null);

  function cancelPending() {
    if (pending.current !== null) {
      window.clearTimeout(pending.current);
      pending.current = null;
    }
  }

  // Synchronize all external navigation, including a new history entry with
  // the same URL. Our own search commits preserve input focus and newer typing.
  useLayoutEffect(() => {
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
  }, [location.key, location.pathname, location.search, query.q]);

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
      internalNavigation.current = href;
      navigate(href);
    }, DEBOUNCE_MS);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    scheduleSearch(event.currentTarget.value);
  }

  function onCompositionStart() {
    composing.current = true;
    cancelPending();
  }

  function onCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    composing.current = false;
    scheduleSearch(event.currentTarget.value);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (composing.current) return;
    cancelPending();
    const href = searchTarget(query, input.current?.value ?? "");
    if (href !== location.pathname + location.search) {
      internalNavigation.current = href;
      navigate(href);
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
        maxLength={100}
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
