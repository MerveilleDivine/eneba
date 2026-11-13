export const platforms = ["steam", "xbox", "playstation", "nintendo", "other"] as const;
export const regions = ["global", "europe", "united-states"] as const;
export const sorts = ["relevance", "name_asc", "price_asc", "price_desc"] as const;

export type Platform = (typeof platforms)[number];
export type Region = (typeof regions)[number];
export type Sort = (typeof sorts)[number];

export type CatalogQuery = {
  q: string;
  platform: Platform | "";
  region: Region | "";
  sort: Sort;
  minPriceCents?: number;
  maxPriceCents?: number;
  page: number;
  pageSize: number;
};

export type ParsedCatalogQuery = { ok: true; query: CatalogQuery } | { ok: false; message: string };

export const CATALOG_PAGE_SIZE = 12;
const permitted = new Set([
  "q",
  "platform",
  "region",
  "sort",
  "minPriceCents",
  "maxPriceCents",
  "page",
  "pageSize",
]);
const safeCents = Number.MAX_SAFE_INTEGER;

export function defaultCatalogQuery(q = ""): CatalogQuery {
  return {
    q,
    platform: "",
    region: "",
    sort: q ? "relevance" : "name_asc",
    page: 1,
    pageSize: CATALOG_PAGE_SIZE,
  };
}

function parseInteger(value: string | null, minimum: number, maximum: number): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

export function parseCatalogSearch(search: string): ParsedCatalogQuery {
  const params = new URLSearchParams(search);
  for (const key of params.keys()) {
    if (!permitted.has(key) || params.getAll(key).length !== 1) {
      return { ok: false, message: "This catalog link contains unsupported or repeated filters." };
    }
  }
  const q = (params.get("q") ?? "").trim();
  if (Array.from(q).length > 100 || q.includes("\0")) {
    return { ok: false, message: "The search must be 100 characters or fewer." };
  }
  const query = defaultCatalogQuery(q);
  const platform = params.get("platform") ?? "";
  const region = params.get("region") ?? "";
  const sort = params.get("sort") ?? query.sort;
  if (platform && !platforms.includes(platform as Platform)) {
    return { ok: false, message: "That gaming platform is not supported." };
  }
  if (region && !regions.includes(region as Region)) {
    return { ok: false, message: "That region is not supported." };
  }
  if (!sorts.includes(sort as Sort)) {
    return { ok: false, message: "That sorting option is not supported." };
  }
  query.platform = platform as CatalogQuery["platform"];
  query.region = region as CatalogQuery["region"];
  query.sort = sort as Sort;

  for (const key of ["minPriceCents", "maxPriceCents"] as const) {
    if (params.has(key)) {
      const amount = parseInteger(params.get(key), 0, safeCents);
      if (amount === null) {
        return { ok: false, message: "The price filters must contain valid euro amounts." };
      }
      query[key] = amount;
    }
  }
  if (
    query.minPriceCents !== undefined &&
    query.maxPriceCents !== undefined &&
    query.minPriceCents > query.maxPriceCents
  ) {
    return { ok: false, message: "The minimum price cannot exceed the maximum." };
  }
  if (params.has("page")) {
    const page = parseInteger(params.get("page"), 1, safeCents);
    if (page === null) return { ok: false, message: "The page number is invalid." };
    query.page = page;
  }
  if (params.has("pageSize")) {
    const pageSize = parseInteger(params.get("pageSize"), 1, 50);
    if (pageSize === null) return { ok: false, message: "The page size is invalid." };
    query.pageSize = pageSize;
  }
  return { ok: true, query };
}

function paramsFor(query: CatalogQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.platform) params.set("platform", query.platform);
  if (query.region) params.set("region", query.region);
  if (query.minPriceCents !== undefined) params.set("minPriceCents", String(query.minPriceCents));
  if (query.maxPriceCents !== undefined) params.set("maxPriceCents", String(query.maxPriceCents));
  if (query.sort !== (query.q ? "relevance" : "name_asc")) params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== CATALOG_PAGE_SIZE) params.set("pageSize", String(query.pageSize));
  return params;
}

export function catalogHref(query: CatalogQuery): string {
  const suffix = paramsFor(query).toString();
  return "/catalog" + (suffix ? "?" + suffix : "");
}

export function catalogRequestPath(query: CatalogQuery): string {
  const params = paramsFor(query);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  return "/api/v1/products?" + params.toString();
}

export function euroInput(cents: number | undefined): string {
  if (cents === undefined) return "";
  return String(Math.floor(cents / 100)) + "." + String(cents % 100).padStart(2, "0");
}

export function parseEuroInput(value: string): number | undefined | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [euros, fraction = ""] = trimmed.split(".");
  const amount = Number(euros) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount <= safeCents ? amount : null;
}
