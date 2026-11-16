import { catalogRequestPath, type CatalogQuery } from "./catalog-query";
import { isProductSummary, type ProductSummary } from "../../shared/api/product-summary";

export type CatalogProduct = ProductSummary;

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

function classifyHttpFailure(status: number): CatalogFailureKind {
  switch (status) {
    case 400:
      return "invalid";
    case 408:
    case 504:
      return "timeout";
    case 502:
    case 503:
      return "unavailable";
    default:
      return "unexpected";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function parseCatalogResponse(
  value: unknown,
  expected: Pick<CatalogQuery, "page" | "pageSize">,
): CatalogPageData {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(isProductSummary) ||
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
    throw new CatalogRequestError(classifyHttpFailure(response.status));
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new CatalogRequestError(error instanceof TypeError ? "network" : "unexpected");
  }
  return parseCatalogResponse(data, query);
}
