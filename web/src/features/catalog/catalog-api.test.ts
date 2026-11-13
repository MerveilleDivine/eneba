import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogRequestError, fetchCatalog, parseCatalogResponse } from "./catalog-api";
import { defaultCatalogQuery } from "./catalog-query";

const query = defaultCatalogQuery();
const product = {
  id: "game-1",
  slug: "solar-drift",
  name: "Solar Drift",
  edition: "Standard",
  platform: "steam",
  region: "global",
  coverUrl: "/images/demo-cover.svg",
  lowestPriceCents: 1999,
  available: true,
};
const payload = { items: [product], total: 1, page: 1, pageSize: 12, currency: "EUR" };

afterEach(() => vi.unstubAllGlobals());

describe("catalog transport boundary", () => {
  it("accepts the complete valid server response", () => {
    expect(parseCatalogResponse(payload, query).items[0].name).toBe("Solar Drift");
    const withHttpsCover = {
      ...payload,
      items: [{ ...product, coverUrl: "https://cdn.example.com/game.png" }],
    };
    expect(parseCatalogResponse(withHttpsCover, query).total).toBe(1);
  });

  it("accepts the last partial page and an out-of-range empty page", () => {
    const secondPage = { ...query, page: 2 };
    expect(parseCatalogResponse({ ...payload, page: 2, total: 13 }, secondPage).items).toHaveLength(
      1,
    );
    expect(
      parseCatalogResponse({ ...payload, page: 2, total: 1, items: [] }, secondPage).items,
    ).toHaveLength(0);
    expect(
      parseCatalogResponse({ ...payload, page: 1, total: 0, items: [] }, query).items,
    ).toHaveLength(0);
  });

  it.each([
    { ...payload, items: [{ ...product, lowestPriceCents: null }] },
    { ...payload, items: [{ ...product, lowestPriceCents: 0 }] },
    { ...payload, items: [{ ...product, lowestPriceCents: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...payload, items: [{ ...product, available: false }] },
    { ...payload, items: [{ ...product, platform: "pc" }] },
    { ...payload, items: [{ ...product, region: "planet-earth" }] },
    { ...payload, items: [{ ...product, name: "  " }] },
    { ...payload, items: [{ ...product, coverUrl: "javascript:alert(1)" }] },
    { ...payload, items: [{ ...product, coverUrl: "data:image/svg+xml,abc" }] },
    { ...payload, items: [{ ...product, coverUrl: "//external.example.com/image.png" }] },
    { ...payload, items: [{ ...product, coverUrl: "http://cdn.example.com/game.png" }] },
    { ...payload, items: [{ ...product, coverUrl: "not-a-valid-cover" }] },
    { ...payload, items: [{ ...product, id: "" }] },
  ])("rejects invalid product fields and availability", (value) => {
    expect(() => parseCatalogResponse(value, query)).toThrow(CatalogRequestError);
  });

  it.each([
    { ...payload, total: 0 },
    { ...payload, total: 2 },
    { ...payload, total: 1, items: [] },
    { ...payload, total: -1 },
    { ...payload, total: 1.2 },
    { ...payload, total: Number.MAX_SAFE_INTEGER + 1 },
    { ...payload, page: 0 },
    { ...payload, page: 2 },
    { ...payload, pageSize: 0 },
    { ...payload, pageSize: 13 },
    { ...payload, pageSize: 51 },
    { ...payload, currency: "USD" },
    { ...payload, items: [product, { ...product }], total: 2 },
  ])("rejects inconsistent pagination, totals, currencies or duplicated products", (value) => {
    expect(() => parseCatalogResponse(value, query)).toThrow(CatalogRequestError);
  });

  it("rejects a result from an unexpected page even when its shape is valid", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ...payload, page: 2, items: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", mock);
    await expect(fetchCatalog(query, new AbortController().signal)).rejects.toMatchObject({
      kind: "unexpected",
    });
  });

  it("requests the same-origin API with the expected pagination", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const result = await fetchCatalog(query, new AbortController().signal);
    expect(result.total).toBe(1);
    expect(mock.mock.calls[0][0]).toContain("/api/v1/products?");
    expect(mock.mock.calls[0][0]).toContain("pageSize=12");
    expect(mock.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });
  });
});
