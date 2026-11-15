import { useRef, useState, type FormEvent } from "react";
import {
  euroInput,
  parseEuroInput,
  platforms,
  regions,
  sorts,
  type CatalogQuery,
  type Sort,
} from "./catalog-query";
import styles from "./CatalogFilters.module.css";
import { platformLabels, regionLabels, sortLabels } from "./catalog-labels";

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
  const platformInput = useRef<HTMLSelectElement>(null);
  const minimumInput = useRef<HTMLInputElement>(null);
  const maximumInput = useRef<HTMLInputElement>(null);

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
      const focusTarget = maximum === null && minimum !== null ? maximumInput : minimumInput;
      focusTarget.current?.focus();
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
    platformInput.current?.focus();
  }

  // Describe only the fields that actually need correcting. A reversed range
  // involves both endpoints; malformed text in one input does not invalidate the other.
  const minimum = parseEuroInput(draft.min);
  const maximum = parseEuroInput(draft.max);
  const reversedRange =
    minimum !== null &&
    minimum !== undefined &&
    maximum !== null &&
    maximum !== undefined &&
    minimum > maximum;
  const invalidMinimum = Boolean(draft.error) && (minimum === null || reversedRange);
  const invalidMaximum = Boolean(draft.error) && (maximum === null || reversedRange);

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
            ref={platformInput}
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
                  ref={minimumInput}
                  aria-invalid={invalidMinimum || undefined}
                  aria-describedby={invalidMinimum ? "catalog-price-error" : undefined}
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
                  ref={maximumInput}
                  aria-invalid={invalidMaximum || undefined}
                  aria-describedby={invalidMaximum ? "catalog-price-error" : undefined}
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
              <p id="catalog-price-error" role="alert" className={styles.fieldError}>
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
        {sorts.map((sort) => (
          <option key={sort} value={sort}>
            {sortLabels[sort]}
          </option>
        ))}
      </select>
    </div>
  );
}
