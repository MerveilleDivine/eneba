import { afterEach, describe, expect, it, vi } from "vitest";
import { BannerRequestError, fetchBanners, parseBannerResponse } from "./banner-api";

const banner = {
  id: "50000000-0000-4000-8000-000000000001",
  headline: "Discover your next world",
  subheading: "Fictional games and demo keys.",
  imageUrl: "/images/banners/discover-world.svg",
  linkHref: "/catalog",
  position: 0,
};

afterEach(() => vi.unstubAllGlobals());

describe("banner transport and validation", () => {
  it("accepts empty and valid bounded source data", () => {
    expect(parseBannerResponse({ items: [] })).toEqual([]);
    expect(parseBannerResponse({ items: [banner] })).toEqual([banner]);
    expect(
      parseBannerResponse({ items: [{ ...banner, linkHref: "/catalog?q=solar" }] }),
    ).toHaveLength(1);
  });

  it("accepts separately sourced ordered banners with maximum-length copy", () => {
    const banners = [
      { ...banner, headline: "A".repeat(120) },
      {
        ...banner,
        id: "50000000-0000-4000-8000-000000000002",
        position: 1,
        headline: "Another world",
        linkHref: "/catalog?q=neon",
      },
    ];
    expect(parseBannerResponse({ items: banners })).toEqual(banners);
  });

  it("rejects malformed, duplicate, unordered and unsafe server data", () => {
    const bad = [
      null,
      {},
      { items: null },
      { items: [banner, banner] },
      { items: [{ ...banner, position: -1 }] },
      { items: [{ ...banner, headline: "" }] },
      { items: [{ ...banner, headline: "x".repeat(121) }] },
      { items: [{ ...banner, headline: " ".repeat(120) + "Sale" }] },
      { items: [{ ...banner, subheading: "x".repeat(241) }] },
      { items: [{ ...banner, subheading: " ".repeat(241) }] },
      { items: [{ ...banner, imageUrl: "/images/banners/../private.svg" }] },
      { items: [{ ...banner, imageUrl: "/images/banners/.svg" }] },
      { items: [{ ...banner, imageUrl: "/images/banners/nested/cover.svg" }] },
      { items: [{ ...banner, imageUrl: "javascript:alert(1)" }] },
      { items: [{ ...banner, linkHref: "//example.org" }] },
      { items: [{ ...banner, linkHref: "/store" }] },
      { items: [{ ...banner, linkHref: "/" }] },
      { items: [{ ...banner, linkHref: "/catalog?q=" + "%20".repeat(1000) }] },
      { items: [{ ...banner, linkHref: "/catalog?sort=wrong" }] },
      { items: [{ ...banner, linkHref: "/catalog?q=a&q=b" }] },
      { items: [{ ...banner, linkHref: "/catalog#private" }] },
      {
        items: [
          { ...banner, position: 2 },
          { ...banner, id: "50000000-0000-4000-8000-000000000002", position: 1 },
        ],
      },
    ];
    for (const data of bad) {
      expect(() => parseBannerResponse(data)).toThrow(BannerRequestError);
    }
  });

  it("requests only the banner endpoint with same-origin credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [banner] })));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    expect(await fetchBanners(controller.signal)).toEqual([banner]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/home/banners",
      expect.objectContaining({
        signal: controller.signal,
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
  });

  it("classifies connection, timeout and malformed response without leaking bodies", async () => {
    for (const [response, kind] of [
      [new Response("internal", { status: 503 }), "unavailable"],
      [new Response("internal", { status: 504 }), "timeout"],
      [new Response("private SQL", { status: 500 }), "unexpected"],
      [new Response("{private", { status: 200 }), "unexpected"],
    ] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(fetchBanners(new AbortController().signal)).rejects.toMatchObject({
        kind,
      });
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("private host")));
    await expect(fetchBanners(new AbortController().signal)).rejects.toMatchObject({
      kind: "network",
    });
  });
});
