import {
  catalogRequestPath,
  platforms,
  regions,
  type CatalogQuery,
  type Platform,
  type Region,
} from "./catalog-query";

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  edition: string;
  platform: Platform;
  region: Region;
  coverUrl: string;
  lowestPriceCents: number | null;
  available: boolean;
};

export type CatalogPageData = {
  items: CatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
  currency: "EUR";
};

export type CatalogFailureKind = "invalid" | "unavailable" | "unexpected" | "network" | "timeout";

export class CatalogRequestError extends Error {
  constructor(public readonly kind: CatalogFailureKind) {
    super(kind);
    this.name = "CatalogRequestError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validCoverUrl(value: unknown): value is string {
  if (!nonEmptyText(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isProduct(value: unknown): value is CatalogProduct {
  if (!record(value)) return false;
  return (
    ["id", "slug", "name", "edition"].every((field) => nonEmptyText(value[field])) &&
    platforms.includes(value.platform as Platform) &&
    regions.includes(value.region as Region) &&
    validCoverUrl(value.coverUrl) &&
    typeof value.available === "boolean" &&
    (value.lowestPriceCents === null ||
      (safeNumber(value.lowestPriceCents) && value.lowestPriceCents > 0)) &&
    value.available === (value.lowestPriceCents !== null)
  );
}

export function parseCatalogResponse(
  value: unknown,
  expected: Pick<CatalogQuery, "page" | "pageSize">,
): CatalogPageData {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(isProduct) ||
    !safeNumber(value.total) ||
    !safeNumber(value.page) ||
    value.page < 1 ||
    !safeNumber(value.pageSize) ||
    value.pageSize < 1 ||
    value.pageSize > 50 ||
    value.page !== expected.page ||
    value.pageSize !== expected.pageSize ||
    value.currency !== "EUR"
  ) {
    throw new CatalogRequestError("unexpected");
  }

  const items = value.items as CatalogProduct[];
  const total = value.total as number;
  const page = value.page as number;
  const pageSize = value.pageSize as number;
  const offset = (page - 1) * pageSize;
  const expectedCount = offset >= total ? 0 : Math.min(pageSize, total - offset);
  if (
    items.length !== expectedCount ||
    new Set(items.map((product) => product.id)).size !== items.length
  ) {
    throw new CatalogRequestError("unexpected");
  }
  return value as CatalogPageData;
}

export async function fetchCatalog(
  query: CatalogQuery,
  signal: AbortSignal,
): Promise<CatalogPageData> {
  let response: Response;
  try {
    response = await fetch(catalogRequestPath(query), {
      signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new CatalogRequestError(error instanceof TypeError ? "network" : "unexpected");
  }
  if (!response.ok) {
    throw new CatalogRequestError(
      response.status === 503 ? "unavailable" : response.status === 400 ? "invalid" : "unexpected",
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new CatalogRequestError("unexpected");
  }
  return parseCatalogResponse(data, query);
}

export function displayEuro(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
