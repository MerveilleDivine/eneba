import { platforms, regions } from "../../shared/product/identity";
import { HomeRequestError, requestHomeData } from "./home-request";

export type Deal = {
  offerId: string;
  productId: string;
  slug: string;
  name: string;
  edition: string;
  platform: (typeof platforms)[number];
  region: (typeof regions)[number];
  coverUrl: string;
  sellerName: string;
  priceCents: number;
  listPriceCents: number;
  discountPercent: number;
  position: number;
};

export type DealsData = { items: Deal[]; currency: "EUR" };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const coverPattern = /^\/images\/covers\/[a-z0-9][a-z0-9_-]*\.(?:webp|svg)$/;
// Directional formatting controls can visually disguise seller names or offers.
const bidiControlPattern = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function safeText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Array.from(value).length <= maximum &&
    !bidiControlPattern.test(value) &&
    !Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  );
}

function isDeal(value: unknown): value is Deal {
  if (!record(value)) return false;
  const price = value.priceCents;
  const listPrice = value.listPriceCents;
  if (
    typeof price !== "number" ||
    typeof listPrice !== "number" ||
    !Number.isSafeInteger(price) ||
    !Number.isSafeInteger(listPrice) ||
    price <= 0 ||
    listPrice <= price
  )
    return false;
  const percent = Number((BigInt(listPrice - price) * 100n) / BigInt(listPrice));
  return (
    typeof value.offerId === "string" &&
    uuidPattern.test(value.offerId) &&
    typeof value.productId === "string" &&
    uuidPattern.test(value.productId) &&
    safeText(value.slug, 160) &&
    slugPattern.test(value.slug) &&
    safeText(value.name, 140) &&
    safeText(value.edition, 80) &&
    safeText(value.sellerName, 100) &&
    typeof value.coverUrl === "string" &&
    value.coverUrl.length <= 400 &&
    coverPattern.test(value.coverUrl) &&
    platforms.includes(value.platform as Deal["platform"]) &&
    regions.includes(value.region as Deal["region"]) &&
    Number.isSafeInteger(value.position) &&
    typeof value.position === "number" &&
    value.position >= 0 &&
    value.position <= 2147483647 &&
    value.discountPercent === percent
  );
}

export function parseDealsResponse(value: unknown): DealsData {
  if (
    !record(value) ||
    value.currency !== "EUR" ||
    !Array.isArray(value.items) ||
    value.items.length > 8 ||
    !value.items.every(isDeal)
  ) {
    throw new HomeRequestError("unexpected");
  }
  const items: Deal[] = value.items;
  if (
    new Set(items.map((item) => item.offerId)).size !== items.length ||
    items.some((item, index) => index > 0 && item.position <= items[index - 1].position)
  ) {
    throw new HomeRequestError("unexpected");
  }
  return { items, currency: "EUR" };
}

export function fetchDeals(signal: AbortSignal): Promise<DealsData> {
  return requestHomeData("/api/v1/home/deals", signal, parseDealsResponse);
}
