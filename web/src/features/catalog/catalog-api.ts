import { catalogRequestPath, type CatalogQuery } from "./catalog-query";

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  edition: string;
  platform: string;
  region: string;
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

export class CatalogRequestError extends Error {
  constructor(public readonly kind: "unavailable" | "invalid" | "unexpected") {
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

function isProduct(value: unknown): value is CatalogProduct {
  if (!record(value)) return false;
  const text = ["id", "slug", "name", "edition", "platform", "region", "coverUrl"];
  return text.every((field) => typeof value[field] === "string" && value[field].length > 0) &&
    typeof value.available === "boolean" &&
    (value.lowestPriceCents === null ||
      (safeNumber(value.lowestPriceCents) && value.lowestPriceCents > 0)) &&
    value.available === (value.lowestPriceCents !== null);
}

export function parseCatalogResponse(value: unknown): CatalogPageData {
  if (!record(value) || !Array.isArray(value.items) || !value.items.every(isProduct) ||
      !safeNumber(value.total) || !safeNumber(value.page) || value.page < 1 ||
      !safeNumber(value.pageSize) || value.pageSize < 1 || value.pageSize > 50 ||
      value.items.length > value.pageSize || value.currency !== "EUR") {
    throw new CatalogRequestError("unexpected");
  }
  return value as CatalogPageData;
}

export async function fetchCatalog(query: CatalogQuery, signal: AbortSignal): Promise<CatalogPageData> {
  const response = await fetch(catalogRequestPath(query), {
    signal,
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new CatalogRequestError(response.status === 503 ? "unavailable" :
      response.status === 400 ? "invalid" : "unexpected");
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new CatalogRequestError("unexpected");
  }
  return parseCatalogResponse(data);
}

export function displayEuro(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
