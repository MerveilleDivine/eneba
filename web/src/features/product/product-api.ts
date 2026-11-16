import { isProductSummary, type ProductSummary } from "../../shared/api/product-summary";
import { offerIdPattern, validProductSlug } from "../../shared/product/identity";
export { offerIdPattern, validProductSlug } from "../../shared/product/identity";

export type SellerOffer = {
  offerId: string;
  sellerId: string;
  sellerName: string;
  sellerRatingPercent: number;
  priceCents: number;
  listPriceCents: number | null;
  available: boolean;
};
export type ProductDetails = {
  product: ProductSummary & { description: string; activationInstructions: string };
  offers: SellerOffer[];
  currency: "EUR";
};
export type ProductFailure =
  "invalid" | "not-found" | "unavailable" | "network" | "timeout" | "unexpected";
export class ProductRequestError extends Error {
  constructor(public readonly kind: ProductFailure) {
    super(kind);
    this.name = "ProductRequestError";
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function safePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function publicText(value: unknown, maximum: number, multiline = false): value is string {
  return (
    typeof value === "string" &&
    (multiline || value.trim().length > 0) &&
    Array.from(value).length <= maximum &&
    !/\p{Cf}/u.test(value) &&
    !Array.from(value).some(
      (c) =>
        (c.charCodeAt(0) < 32 && !(multiline && ["\n", "\r", "\t"].includes(c))) ||
        c.charCodeAt(0) === 127,
    )
  );
}
function isOffer(value: unknown): value is SellerOffer {
  if (!record(value)) return false;
  return (
    typeof value.offerId === "string" &&
    offerIdPattern.test(value.offerId) &&
    typeof value.sellerId === "string" &&
    offerIdPattern.test(value.sellerId) &&
    publicText(value.sellerName, 100) &&
    typeof value.sellerRatingPercent === "number" &&
    Number.isInteger(value.sellerRatingPercent) &&
    value.sellerRatingPercent >= 0 &&
    value.sellerRatingPercent <= 100 &&
    safePrice(value.priceCents) &&
    (value.listPriceCents === null ||
      (safePrice(value.listPriceCents) && value.listPriceCents > value.priceCents)) &&
    typeof value.available === "boolean"
  );
}
export function parseProductResponse(value: unknown, slug: string): ProductDetails {
  const invalid = () => new ProductRequestError("unexpected");
  if (!record(value) || !record(value.product)) throw invalid();
  const description = value.product.description;
  const activationInstructions = value.product.activationInstructions;
  if (
    value.currency !== "EUR" ||
    !isProductSummary(value.product) ||
    value.product.slug !== slug ||
    !validProductSlug(value.product.slug) ||
    !offerIdPattern.test(value.product.id) ||
    !publicText(value.product.name, 140) ||
    !publicText(value.product.edition, 80) ||
    !publicText(description, 5000, true) ||
    !publicText(activationInstructions, 1000, true) ||
    (typeof activationInstructions === "string" && activationInstructions.trim() === "") ||
    value.product.coverUrl.length > 400 ||
    !Array.isArray(value.offers) ||
    value.offers.length > 50 ||
    !value.offers.every(isOffer)
  )
    throw invalid();
  const offers: SellerOffer[] = value.offers;
  if (
    new Set(offers.map((o) => o.offerId)).size !== offers.length ||
    new Set(offers.map((o) => o.sellerId)).size !== offers.length
  )
    throw invalid();
  const available = offers.filter((o) => o.available);
  const lowest = available.length ? Math.min(...available.map((o) => o.priceCents)) : null;
  if (lowest !== value.product.lowestPriceCents) throw invalid();
  return {
    product: { ...value.product, description, activationInstructions },
    offers,
    currency: "EUR",
  };
}
export function productFailure(error: unknown): ProductFailure {
  return error instanceof ProductRequestError ? error.kind : "unexpected";
}
export async function fetchProduct(slug: string, signal: AbortSignal): Promise<ProductDetails> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/products/${encodeURIComponent(slug)}`, {
      signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ProductRequestError(error instanceof TypeError ? "network" : "unexpected");
  }
  if (!response.ok) {
    throw new ProductRequestError(
      response.status === 400
        ? "invalid"
        : response.status === 404
          ? "not-found"
          : [408, 504].includes(response.status)
            ? "timeout"
            : [502, 503].includes(response.status)
              ? "unavailable"
              : "unexpected",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ProductRequestError(error instanceof TypeError ? "network" : "unexpected");
  }
  return parseProductResponse(body, slug);
}
