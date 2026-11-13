import { describe, expect, it } from "vitest";
import { platformLabels, regionLabels } from "./catalog-labels";
import {
  catalogHref,
  catalogRequestPath,
  defaultCatalogQuery,
  euroInput,
  parseCatalogSearch,
  parseEuroInput,
  platforms,
  regions,
} from "./catalog-query";

describe("catalog URL state", () => {
  it("parses defaults and creates shareable URLs", () => {
    expect(parseCatalogSearch("")).toEqual({ ok: true, query: defaultCatalogQuery() });
    const parsed = parseCatalogSearch("?q=solar&platform=steam&sort=price_asc&page=2");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query).toMatchObject({
      q: "solar",
      platform: "steam",
      sort: "price_asc",
      page: 2,
      pageSize: 12,
    });
    expect(catalogHref(parsed.query)).toBe("/catalog?q=solar&platform=steam&sort=price_asc&page=2");
    expect(catalogRequestPath(parsed.query)).toContain("pageSize=12");
  });

  it.each([
    "?platform=pc",
    "?region=mars",
    "?sort=DROP",
    "?q=one&q=two",
    "?unknown=1",
    "?page=0",
    "?page=1.1",
    "?pageSize=51",
    "?minPriceCents=-1",
    "?maxPriceCents=999999999999999999",
    "?minPriceCents=300&maxPriceCents=200",
  ])("rejects invalid browsing state: %s", (search) => {
    expect(parseCatalogSearch(search).ok).toBe(false);
  });

  it("keeps UI labels exhaustive and aligned with supported catalog values", () => {
    expect(Object.keys(platformLabels)).toEqual([...platforms]);
    expect(Object.keys(regionLabels)).toEqual([...regions]);
    for (const platform of platforms) expect(platformLabels[platform]).toBeTruthy();
    for (const region of regions) expect(regionLabels[region]).toBeTruthy();
  });

  it("converts euro inputs to safe integer cents", () => {
    expect(parseEuroInput("19.99")).toBe(1999);
    expect(parseEuroInput("0,5")).toBe(50);
    expect(parseEuroInput("")).toBeUndefined();
    expect(parseEuroInput("2.345")).toBeNull();
    expect(parseEuroInput("-1")).toBeNull();
    expect(euroInput(1999)).toBe("19.99");
  });
});
