import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchProduct,
  parseProductResponse,
  ProductRequestError,
  type ProductDetails,
} from "./product-api";
import { parseOfferSelection } from "./product-selection";

const offer = {
  offerId: "30000000-0000-4000-8000-000000000005",
  sellerId: "20000000-0000-4000-8000-000000000001",
  sellerName: "Northern Pixel",
  sellerRatingPercent: 98,
  priceCents: 1410,
  listPriceCents: null,
  available: true,
};
const fixture: ProductDetails = {
  currency: "EUR",
  product: {
    id: "10000000-0000-4000-8000-000000000003",
    slug: "neon-circuit",
    name: "Neon Circuit",
    edition: "Deluxe",
    platform: "playstation",
    region: "united-states",
    coverUrl: "/images/covers/neon-circuit.webp",
    description: "Fictional game.\nNo real license.",
    lowestPriceCents: 1410,
    available: true,
  },
  offers: [
    offer,
    {
      ...offer,
      offerId: "30000000-0000-4000-8000-000000000006",
      sellerId: "20000000-0000-4000-8000-000000000002",
      sellerName: "Orbit Games",
      priceCents: 1660,
      listPriceCents: 2260,
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());
describe("product contract", () => {
  it("retains a distinct non-cheapest seller offer", () => {
    const result = parseProductResponse(fixture, "neon-circuit");
    expect(result.offers[1].offerId).toBe("30000000-0000-4000-8000-000000000006");
    expect(result.offers[1].priceCents).toBe(1660);
    expect(result.product.lowestPriceCents).toBe(1410);
  });
  it.each([
    { ...fixture, product: { ...fixture.product, slug: "solar-drift" } },
    { ...fixture, product: { ...fixture.product, lowestPriceCents: 1 } },
    { ...fixture, offers: [{ ...offer, priceCents: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...fixture, offers: [{ ...offer, sellerName: " \uFEFF " }] },
    { ...fixture, offers: [{ ...offer, sellerName: "Seller\u202e" }] },
    { ...fixture, offers: [{ ...offer, sellerRatingPercent: 101 }] },
    { ...fixture, offers: [{ ...offer, listPriceCents: offer.priceCents }] },
    { ...fixture, offers: [offer, offer] },
    { ...fixture, offers: [{ ...offer, available: false }] },
    { ...fixture, product: { ...fixture.product, coverUrl: "/\n/other.example/cover.webp" } },
    { ...fixture, product: { ...fixture.product, description: "x".repeat(5001) } },
    { ...fixture, offers: Array.from({ length: 51 }, () => offer) },
  ])("rejects inconsistent or unsafe public data %#", (value) => {
    expect(() => parseProductResponse(value, "neon-circuit")).toThrow(ProductRequestError);
  });
  it("accepts sold out and empty offer lists without a made-up price", () => {
    for (const offers of [[], [{ ...offer, available: false }]]) {
      const value = {
        ...fixture,
        product: { ...fixture.product, lowestPriceCents: null, available: false },
        offers,
      };
      expect(parseProductResponse(value, "neon-circuit").product.available).toBe(false);
    }
  });
  it.each([
    [404, "not-found"],
    [400, "invalid"],
    [503, "unavailable"],
    [504, "timeout"],
    [500, "unexpected"],
  ])("classifies HTTP %i without exposing its body", async (status, kind) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("private connection string", { status: status as number })),
    );
    await expect(fetchProduct("neon-circuit", new AbortController().signal)).rejects.toMatchObject({
      kind,
      message: kind,
    });
  });
});
describe("offer identity in links", () => {
  it("does not choose a seller on a plain product link", () =>
    expect(parseOfferSelection("")).toEqual({ valid: true, offerId: null }));
  it("preserves the requested identity", () =>
    expect(parseOfferSelection(`?offerId=${offer.offerId.toUpperCase()}`)).toEqual({
      valid: true,
      offerId: offer.offerId,
    }));
  it.each([
    "?offerId=",
    "?offerId=not-an-id",
    `?offerId=${offer.offerId}&offerId=${offer.offerId}`,
    `?offerId=${offer.offerId}&priceCents=1`,
    "?seller=cheapest",
  ])("rejects %s without choosing a replacement", (search) =>
    expect(parseOfferSelection(search)).toEqual({ valid: false }),
  );
});
