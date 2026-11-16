import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCartQuote, parseQuote, QuoteRequestError } from "./quote-api";
import type { CartLine } from "./cart-store";

const id = "30000000-0000-4000-8000-000000000001";
const otherId = "30000000-0000-4000-8000-000000000002";
const selected: readonly CartLine[] = [{ offerId: id, slug: "solar-drift", quantity: 1 }];
const available = {
  offerId: id,
  quantity: 1,
  productSlug: "solar-drift",
  productName: "Solar Drift",
  edition: "Standard",
  platform: "steam",
  region: "global",
  sellerName: "Orbit Games",
  sellerRatingPercent: 96,
  unitPriceCents: 1136,
  lineTotalCents: 1136,
  available: true,
};
const response = { lines: [available], totalCents: 1136, currency: "EUR" };

afterEach(() => vi.unstubAllGlobals());

describe("server-owned cart quote", () => {
  it("accepts only a consistent price and offer identity", () => {
    const parsed = parseQuote(response, selected);
    expect(parsed.totalCents).toBe(1136);
    expect(parsed.lines[0].sellerName).toBe("Orbit Games");
    expect(() => parseQuote({ ...response, totalCents: 1137 }, selected)).toThrowError(QuoteRequestError);
    expect(() => parseQuote({ ...response, lines: [{ ...available, offerId: otherId }] }, selected)).toThrowError(QuoteRequestError);
    expect(() => parseQuote({ ...response, lines: [{ ...available, lineTotalCents: 100 }] }, selected)).toThrowError(QuoteRequestError);
  });

  it("cannot turn a sold-out or unknown offer into a priced cart", () => {
    const soldOut = { ...available, available: false, lineTotalCents: null };
    expect(parseQuote({ lines: [soldOut], totalCents: null, currency: "EUR" }, selected))
      .toMatchObject({ totalCents: null, lines: [{ available: false }] });
    expect(() => parseQuote({ lines: [soldOut], totalCents: 1136, currency: "EUR" }, selected)).toThrowError(QuoteRequestError);
    expect(() => parseQuote({ lines: [{ ...available, available: true, unitPriceCents: null }], totalCents: 1136, currency: "EUR" }, selected)).toThrowError(QuoteRequestError);
    const removed = { ...soldOut, productSlug: null, productName: null, edition: null, platform: null,
      region: null, sellerName: null, sellerRatingPercent: null, unitPriceCents: null };
    expect(parseQuote({ lines: [removed], totalCents: null, currency: "EUR" }, selected)
      .lines[0].productName).toBeNull();
  });

  it("rejects unsupported prices, totals, labels and unsafe sums", () => {
    for (const value of [0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseQuote({ ...response, lines: [{ ...available, unitPriceCents: value }] }, selected)).toThrowError(QuoteRequestError);
    }
    expect(() => parseQuote({ ...response, lines: [{ ...available, sellerName: "Hidden\u202eSeller" }] }, selected)).toThrowError(QuoteRequestError);
    expect(() => parseQuote({ ...response, lines: [{ ...available, platform: "unsupported" }] }, selected)).toThrowError(QuoteRequestError);
    const two: readonly CartLine[] = [...selected, { offerId: otherId, quantity: 1, slug: "solar-drift" }];
    const other = { ...available, offerId: otherId, unitPriceCents: Number.MAX_SAFE_INTEGER,
      lineTotalCents: Number.MAX_SAFE_INTEGER };
    expect(() => parseQuote({ lines: [available, other], totalCents: Number.MAX_SAFE_INTEGER, currency: "EUR" }, two)).toThrowError(QuoteRequestError);
  });

  it("sends selected offers and quantities, never browser prices", async () => {
    const mocked = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", mocked);
    expect((await fetchCartQuote(selected, new AbortController().signal)).totalCents).toBe(1136);
    expect(mocked).toHaveBeenCalledOnce();
    const [path, request] = mocked.mock.calls[0];
    expect(path).toBe("/api/v1/cart/quote");
    expect(request.method).toBe("POST");
    expect(request.credentials).toBe("same-origin");
    expect(JSON.parse(request.body)).toEqual({ lines: [{ offerId: id, quantity: 1 }] });
  });

  it("handles service unavailability and malformed responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    await expect(fetchCartQuote(selected, new AbortController().signal)).rejects.toMatchObject({ kind: "unavailable" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await expect(fetchCartQuote(selected, new AbortController().signal)).rejects.toMatchObject({ kind: "unexpected" });
  });
});
