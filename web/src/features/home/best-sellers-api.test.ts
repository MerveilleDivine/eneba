import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBestSellers, parseBestSellersResponse, type BestSeller } from "./best-sellers-api";
import { HomeRequestError } from "./home-request";

const first: BestSeller = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "solar-drift",
  name: "Solar Drift",
  edition: "Standard",
  platform: "steam",
  region: "global",
  coverUrl: "/images/covers/solar-drift.webp",
  lowestPriceCents: 1136,
  available: true,
  demoWeeklySales: 120,
};

const second: BestSeller = {
  ...first,
  id: "10000000-0000-4000-8000-000000000003",
  slug: "neon-circuit",
  name: "Neon Circuit",
  demoWeeklySales: 103,
  lowestPriceCents: null,
  available: false,
};

afterEach(() => vi.unstubAllGlobals());

describe("best-seller API", () => {
  it("accepts ranked catalog-compatible products including sold-out SKUs", () => {
    expect(parseBestSellersResponse({ items: [], currency: "EUR" })).toEqual({
      items: [],
      currency: "EUR",
    });
    expect(parseBestSellersResponse({ items: [first, second], currency: "EUR" })).toEqual({
      items: [first, second],
      currency: "EUR",
    });
  });

  it("rejects untrusted prices, counts, duplicates, bad order and wrong currency", () => {
    const invalid = [
      null,
      {},
      { items: [], currency: "USD" },
      { items: [first, first], currency: "EUR" },
      { items: [second, first], currency: "EUR" },
      { items: [first, { ...second, demoWeeklySales: -1 }], currency: "EUR" },
      { items: [{ ...first, demoWeeklySales: 2147483648 }], currency: "EUR" },
      { items: [{ ...first, lowestPriceCents: null }], currency: "EUR" },
      { items: [{ ...first, available: false }], currency: "EUR" },
      { items: [{ ...first, platform: "unsupported" }], currency: "EUR" },
      { items: [{ ...first, coverUrl: "javascript:alert(1)" }], currency: "EUR" },
      {
        items: Array.from({ length: 9 }, (_, i) => ({ ...first, id: String(i) })),
        currency: "EUR",
      },
    ];
    for (const input of invalid) {
      expect(() => parseBestSellersResponse(input)).toThrow(HomeRequestError);
    }
  });

  it("fetches only its endpoint with credentials and never exposes error bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [first], currency: "EUR" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    expect(await fetchBestSellers(controller.signal)).toEqual({
      items: [first],
      currency: "EUR",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/home/best-sellers",
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
      await expect(fetchBestSellers(new AbortController().signal)).rejects.toMatchObject({
        kind,
      });
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("internal hostname")));
    await expect(fetchBestSellers(new AbortController().signal)).rejects.toMatchObject({
      kind: "network",
    });
  });
});
