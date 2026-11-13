import { useState, type FormEvent } from "react";
import {
  euroInput,
  parseEuroInput,
  platforms,
  regions,
  type CatalogQuery,
  type Sort,
} from "./catalog-query";
import styles from "./CatalogPage.module.css";
import { platformLabels, regionLabels } from "./catalog-labels";

type Props = {
  query: CatalogQuery;
  onChange: (next: CatalogQuery) => void;
  onClear: () => void;
};

function priceDraftFor(query: CatalogQuery) {
  return {
    appliedKey: `${query.minPriceCents ?? ""}:${query.maxPriceCents ?? ""}`,
    min: euroInput(query.minPriceCents),
    max: euroInput(query.maxPriceCents),
    error: "",
  };
}

export function CatalogFilters({ query, onChange, onClear }: Props) {
  const applied = priceDraftFor(query);
  const [draft, setDraft] = useState(() => applied);

  // Preserve unsubmitted edits across unrelated filters, but restore the URL's
  // prices when the applied range changes (including Back/Forward).
  if (draft.appliedKey !== applied.appliedKey) {
    setDraft(applied);
  }

  function submitPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minimum = parseEuroInput(draft.min);
    const maximum = parseEuroInput(draft.max);
    if (
      minimum === null ||
      maximum === null ||
      (minimum !== undefined && maximum !== undefined && minimum > maximum)
    ) {
      setDraft((previous) => ({
        ...previous,
        error: "Enter valid euro prices, with the minimum no higher than the maximum.",
      }));
      return;
    }
    setDraft((previous) => ({ ...previous, error: "" }));
    if (minimum !== query.minPriceCents || maximum !== query.maxPriceCents || query.page !== 1) {
      onChange({ ...query, minPriceCents: minimum, maxPriceCents: maximum, page: 1 });
    }
  }

  function clearFilters() {
    setDraft({ ...applied, min: "", max: "", error: "" });
    onClear();
  }

  const hasFilters = Boolean(
    query.platform ||
    query.region ||
    query.minPriceCents !== undefined ||
    query.maxPriceCents !== undefined ||
    query.q,
  );
  return (
    <aside className={styles.sidebar} aria-label="Catalog filters">
      <div className={styles.filterHeading}>
        <h2>Filters</h2>
        {hasFilters && (
          <button type="button" className={styles.clear} onClick={clearFilters}>
            Clear all
          </button>
        )}
      </div>
      <div className={styles.filterFields}>
        <label className={styles.field}>
          <span>Platform</span>
          <select
            value={query.platform}
            onChange={(event) =>
              onChange({
                ...query,
                platform: event.target.value as CatalogQuery["platform"],
                page: 1,
              })
            }
          >
            <option value="">All platforms</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platformLabels[platform]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Region</span>
          <select
            value={query.region}
            onChange={(event) =>
              onChange({ ...query, region: event.target.value as CatalogQuery["region"], page: 1 })
            }
          >
            <option value="">All regions</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {regionLabels[region]}
              </option>
            ))}
          </select>
        </label>
        <form onSubmit={submitPrice} className={styles.priceForm}>
          <fieldset>
            <legend>Price range (€)</legend>
            <div className={styles.priceRow}>
              <label className={styles.field}>
                <span>Min</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.min}
                  onChange={(event) =>
                    setDraft((previous) => ({ ...previous, min: event.target.value, error: "" }))
                  }
                  placeholder="0.00"
                />
              </label>
              <label className={styles.field}>
                <span>Max</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.max}
                  onChange={(event) =>
                    setDraft((previous) => ({ ...previous, max: event.target.value, error: "" }))
                  }
                  placeholder="Any"
                />
              </label>
            </div>
            {draft.error && (
              <p role="alert" className={styles.fieldError}>
                {draft.error}
              </p>
            )}
            <button type="submit" className={styles.applyButton}>
              Apply price
            </button>
          </fieldset>
        </form>
      </div>
    </aside>
  );
}

export function CatalogSort({ query, onChange }: Pick<Props, "query" | "onChange">) {
  return (
    <div className={styles.sortGroup}>
      <label htmlFor="catalog-sort">Sort by</label>
      <select
        id="catalog-sort"
        value={query.sort}
        onChange={(event) => onChange({ ...query, sort: event.target.value as Sort, page: 1 })}
      >
        <option value="relevance">Relevance</option>
        <option value="name_asc">Name A–Z</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
      </select>
    </div>
  );
}
