import { useState, type FormEvent } from "react";
import {
  euroInput,
  parseEuroInput,
  type CatalogQuery,
  type Platform,
  type Region,
  type Sort,
} from "./catalog-query";
import styles from "./CatalogPage.module.css";

const platformOptions: { value: Platform; label: string }[] = [
  { value: "steam", label: "Steam" },
  { value: "xbox", label: "Xbox" },
  { value: "playstation", label: "PlayStation" },
  { value: "nintendo", label: "Nintendo" },
  { value: "other", label: "Other" },
];
const regionOptions: { value: Region; label: string }[] = [
  { value: "global", label: "Global" },
  { value: "europe", label: "Europe" },
  { value: "united-states", label: "United States" },
];

type Props = {
  query: CatalogQuery;
  onChange: (next: CatalogQuery) => void;
  onClear: () => void;
};

export function CatalogFilters({ query, onChange, onClear }: Props) {
  const [minPrice, setMinPrice] = useState(euroInput(query.minPriceCents));
  const [maxPrice, setMaxPrice] = useState(euroInput(query.maxPriceCents));
  const [priceError, setPriceError] = useState("");

  function submitPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minimum = parseEuroInput(minPrice);
    const maximum = parseEuroInput(maxPrice);
    if (
      minimum === null ||
      maximum === null ||
      (minimum !== undefined && maximum !== undefined && minimum > maximum)
    ) {
      setPriceError("Enter valid euro prices, with the minimum no higher than the maximum.");
      return;
    }
    setPriceError("");
    onChange({ ...query, minPriceCents: minimum, maxPriceCents: maximum, page: 1 });
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
          <button type="button" className={styles.clear} onClick={onClear}>
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
            {platformOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
            {regionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
                  value={minPrice}
                  onChange={(event) => setMinPrice(event.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label className={styles.field}>
                <span>Max</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  placeholder="Any"
                />
              </label>
            </div>
            {priceError && (
              <p role="alert" className={styles.fieldError}>
                {priceError}
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
