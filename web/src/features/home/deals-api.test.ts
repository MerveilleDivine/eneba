import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDeals, parseDealsResponse, type Deal } from "./deals-api";
import { HomeRequestError } from "./home-request";

const outpost: Deal = {
  offerId: "30000000-0000-4000-8000-000000000003",
  productId: "10000000-0000-4000-8000-000000000002",
  slug: "the-last-outpost",
  name: "The Last Outpost",
  edition: "Standard",
  platform: "xbox",
  region: "europe",
  coverUrl: "/images/covers/the-last-outpost.webp",
  sellerName: "Purple Lantern",
  priceCents: 1273,
  listPriceCents: 1873,
  discountPercent: 32,
  position: 0,
};

const other: Deal = {
  ...outpost,
  offerId: "30000000-0000-4000-8000-000000000004",
  sellerName: "Northern Pixel",
  priceCents: 1523,
  listPriceCents: 2000,
  discountPercent: 23,
  position: 1,
};

afterEach(() => vi.unstubAllGlobals());

describe("deals source contract", () => {
  it("accepts independent seller offers, including the same product twice", () => {
    expect(parseDealsResponse({ items: [], currency: "EUR" })).toEqual({
      items: [],
      currency: "EUR",
    });
    expect(parseDealsResponse({ items: [outpost, other], currency: "EUR" })).toEqual({
      items: [outpost, other],
      currency: "EUR",
    });
  });

  it("rejects inconsistent prices, discounts, identity and unsafe content", () => {
    const invalid = [
      null,
      {},
      { currency: "USD", items: [] },
      { currency: "EUR", items: [outpost, outpost] },
      { currency: "EUR", items: [other, outpost] },
      { currency: "EUR", items: [{ ...outpost, priceCents: 0 }] },
      { currency: "EUR", items: [{ ...outpost, listPriceCents: outpost.priceCents }] },
      { currency: "EUR", items: [{ ...outpost, listPriceCents: Number.MAX_SAFE_INTEGER + 1 }] },
      { currency: "EUR", items: [{ ...outpost, discountPercent: 33 }] },
      { currency: "EUR", items: [{ ...outpost, coverUrl: "javascript:alert(1)" }] },
      { currency: "EUR", items: [{ ...outpost, sellerName: "<bad>\n" }] },
      { currency: "EUR", items: [{ ...outpost, position: -1 }] },
      { currency: "EUR", items: [{ ...outpost, platform: "unsupported" }] },
      { currency: "EUR", items: [{ ...outpost, offerId: "wrong" }] },
      {
        currency: "EUR",
        items: Array.from({ length: 9 }, (_, index) => ({
          ...outpost,
          position: index,
          offerId: String(index),
        })),
      },
    ];
    for (const payload of invalid) {
      expect(() => parseDealsResponse(payload)).toThrow(HomeRequestError);
    }
  });

  it("checks extreme cent values without floating-point discount drift", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const almost = { ...outpost, priceCents: max - 1, listPriceCents: max, discountPercent: 0 };
    expect(parseDealsResponse({ currency: "EUR", items: [almost] }).items[0]).toEqual(almost);
    expect(() =>
      parseDealsResponse({ currency: "EUR", items: [{ ...almost, discountPercent: 1 }] }),
    ).toThrow(HomeRequestError);
  });

  it("fetches only Deals and never leaks upstream failure bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [outpost], currency: "EUR" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    expect(await fetchDeals(controller.signal)).toEqual({ items: [outpost], currency: "EUR" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/home/deals",
      expect.objectContaining({
        signal: controller.signal,
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    for (const [status, kind] of [
      [503, "unavailable"],
      [504, "timeout"],
      [500, "unexpected"],
    ] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private SQL", { status })));
      await expect(fetchDeals(new AbortController().signal)).rejects.toMatchObject({ kind });
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("private hostname")));
    await expect(fetchDeals(new AbortController().signal)).rejects.toMatchObject({
      kind: "network",
    });
  });
});
