import {
  offerIdPattern,
  platforms,
  regions,
  validProductSlug,
} from "../../shared/product/identity";
import type { CartLine } from "./cart-store";

export type QuotedLine = {
  offerId: string;
  quantity: 1;
  productSlug: string | null;
  productName: string | null;
  edition: string | null;
  platform: (typeof platforms)[number] | null;
  region: (typeof regions)[number] | null;
  sellerName: string | null;
  sellerRatingPercent: number | null;
  unitPriceCents: number | null;
  lineTotalCents: number | null;
  available: boolean;
};
export type CartQuote = { lines: QuotedLine[]; totalCents: number | null; currency: "EUR" };
export type QuoteFailure = "invalid" | "unavailable" | "timeout" | "network" | "unexpected";
export class QuoteRequestError extends Error {
  constructor(public readonly kind: QuoteFailure) {
    super(kind);
    this.name = "QuoteRequestError";
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function price(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function safeText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Array.from(value).length <= max &&
    !/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value) &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}
function nullableText(value: unknown, max: number): value is string | null {
  return value === null || safeText(value, max);
}
function isLine(value: unknown): value is QuotedLine {
  if (!record(value)) return false;
  return (
    typeof value.offerId === "string" &&
    offerIdPattern.test(value.offerId) &&
    value.quantity === 1 &&
    (value.productSlug === null ||
      (typeof value.productSlug === "string" && validProductSlug(value.productSlug))) &&
    nullableText(value.productName, 140) &&
    nullableText(value.edition, 80) &&
    (value.platform === null || platforms.includes(value.platform as (typeof platforms)[number])) &&
    (value.region === null || regions.includes(value.region as (typeof regions)[number])) &&
    nullableText(value.sellerName, 100) &&
    (value.sellerRatingPercent === null ||
      (typeof value.sellerRatingPercent === "number" &&
        Number.isInteger(value.sellerRatingPercent) &&
        value.sellerRatingPercent >= 0 &&
        value.sellerRatingPercent <= 100)) &&
    (value.unitPriceCents === null || price(value.unitPriceCents)) &&
    (value.lineTotalCents === null || price(value.lineTotalCents)) &&
    typeof value.available === "boolean"
  );
}
export function parseQuote(value: unknown, lines: readonly CartLine[]): CartQuote {
  const invalid = () => new QuoteRequestError("unexpected");
  if (
    !record(value) ||
    value.currency !== "EUR" ||
    !Array.isArray(value.lines) ||
    value.lines.length !== lines.length ||
    !value.lines.every(isLine) ||
    (value.totalCents !== null && !price(value.totalCents))
  )
    throw invalid();
  const quoted: QuotedLine[] = value.lines;
  let sum = 0;
  for (let index = 0; index < quoted.length; index++) {
    const line = quoted[index];
    if (line.offerId !== lines[index].offerId || line.quantity !== lines[index].quantity)
      throw invalid();
    if (
      line.available &&
      (line.productSlug === null ||
        line.productName === null ||
        line.edition === null ||
        line.platform === null ||
        line.region === null ||
        line.sellerName === null ||
        line.sellerRatingPercent === null ||
        line.unitPriceCents === null ||
        line.lineTotalCents !== line.unitPriceCents)
    )
      throw invalid();
    if (!line.available && line.lineTotalCents !== null) throw invalid();
    if (line.available) {
      sum += line.unitPriceCents!;
      if (!Number.isSafeInteger(sum)) throw invalid();
    }
  }
  const allAvailable = quoted.every((line) => line.available);
  if (allAvailable ? value.totalCents !== sum : value.totalCents !== null) throw invalid();
  return { lines: quoted, totalCents: value.totalCents, currency: "EUR" };
}
export async function fetchCartQuote(
  lines: readonly CartLine[],
  signal: AbortSignal,
): Promise<CartQuote> {
  let response: Response;
  try {
    response = await fetch("/api/v1/cart/quote", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: lines.map(({ offerId, quantity }) => ({ offerId, quantity })),
      }),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new QuoteRequestError(error instanceof TypeError ? "network" : "unexpected");
  }
  if (!response.ok) {
    throw new QuoteRequestError(
      response.status === 400
        ? "invalid"
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
    throw new QuoteRequestError(error instanceof TypeError ? "network" : "unexpected");
  }
  return parseQuote(body, lines);
}
