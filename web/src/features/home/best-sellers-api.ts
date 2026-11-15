import { isCatalogProduct, type CatalogProduct } from "../catalog/catalog-api";
import { HomeRequestError, requestHomeData } from "./home-request";

export type BestSeller = CatalogProduct & { demoWeeklySales: number };
export type BestSellersData = { items: BestSeller[]; currency: "EUR" };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBestSeller(value: unknown): value is BestSeller {
  if (!record(value)) return false;
  const sales = value.demoWeeklySales;
  return (
    isCatalogProduct(value) &&
    typeof sales === "number" &&
    Number.isSafeInteger(sales) &&
    sales >= 0 &&
    sales <= 2147483647
  );
}

export function parseBestSellersResponse(value: unknown): BestSellersData {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 8 ||
    value.currency !== "EUR" ||
    !value.items.every(isBestSeller)
  ) {
    throw new HomeRequestError("unexpected");
  }
  const items: BestSeller[] = value.items;
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some(
      (item, index) => index > 0 && item.demoWeeklySales > items[index - 1].demoWeeklySales,
    )
  ) {
    throw new HomeRequestError("unexpected");
  }
  return { items, currency: "EUR" };
}

export function fetchBestSellers(signal: AbortSignal): Promise<BestSellersData> {
  return requestHomeData("/api/v1/home/best-sellers", signal, parseBestSellersResponse);
}
