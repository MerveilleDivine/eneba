import { describe, expect, it, vi } from "vitest";
import { CatalogRequestError, fetchCatalog, parseCatalogResponse } from "./catalog-api";
import { defaultCatalogQuery } from "./catalog-query";

const product = {
  id: "game-1", slug: "solar-drift", name: "Solar Drift", edition: "Standard",
  platform: "steam", region: "global", coverUrl: "/images/demo-cover.svg",
  lowestPriceCents: 1999, available: true,
};
const payload = { items: [product], total: 1, page: 1, pageSize: 12, currency: "EUR" };

describe("catalog transport boundary", () => {
  it("accepts the server's response contract", () => {
    expect(parseCatalogResponse(payload).items[0].name).toBe("Solar Drift");
  });
  it("refuses malformed products and inconsistent availability", () => {
    expect(() => parseCatalogResponse({ ...payload, items: [{ ...product, lowestPriceCents: null }] }))
      .toThrow(CatalogRequestError);
    expect(() => parseCatalogResponse({ ...payload, pageSize: 0 })).toThrow(CatalogRequestError);
  });
  it("makes the same-origin request with the expected pagination", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const result = await fetchCatalog(defaultCatalogQuery(), new AbortController().signal);
    expect(result.total).toBe(1);
    expect(mock.mock.calls[0][0]).toContain("/api/v1/products?");
    expect(mock.mock.calls[0][0]).toContain("pageSize=12");
    expect(mock.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });
  });
});
