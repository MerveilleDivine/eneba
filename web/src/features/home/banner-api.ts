import { parseCatalogSearch } from "../catalog/catalog-query";

export type HomepageBanner = {
  id: string;
  headline: string;
  subheading: string;
  imageUrl: string;
  linkHref: string;
  position: number;
};

export type BannerFailure = "unavailable" | "network" | "timeout" | "unexpected";

export class BannerRequestError extends Error {
  constructor(public readonly kind: BannerFailure) {
    super(kind);
    this.name = "BannerRequestError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeBannerImage(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 400) return false;
  if (!value.startsWith("/images/banners/") || value.includes("..") || value.includes("//"))
    return false;
  const file = value.slice("/images/banners/".length);
  return /^[a-z0-9/_-]+(?:\.[a-z0-9_-]+)*\.(?:svg|webp)$/.test(file);
}

function safeBannerDestination(value: unknown): value is string {
  if (value === "/" || value === "/catalog") return true;
  if (typeof value !== "string" || !value.startsWith("/catalog?")) return false;
  const hasControls = Array.from(value).some((character) => character.charCodeAt(0) < 32);
  if (value.includes("\\") || value.includes("#") || hasControls) return false;
  try {
    const url = new URL(value, "https://example.invalid");
    return (
      url.origin === "https://example.invalid" &&
      url.pathname === "/catalog" &&
      url.search !== "" &&
      parseCatalogSearch(url.search).ok
    );
  } catch {
    return false;
  }
}

function validBanner(value: unknown): value is HomepageBanner {
  if (!record(value)) return false;
  const headline = value.headline;
  const subheading = value.subheading;
  return (
    typeof value.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id) &&
    typeof headline === "string" &&
    headline.trim().length > 0 &&
    Array.from(headline.trim()).length <= 120 &&
    typeof subheading === "string" &&
    Array.from(subheading.trim()).length <= 240 &&
    Number.isSafeInteger(value.position) &&
    (value.position as number) >= 0 &&
    safeBannerImage(value.imageUrl) &&
    safeBannerDestination(value.linkHref)
  );
}

export function parseBannerResponse(input: unknown): HomepageBanner[] {
  if (!record(input) || !Array.isArray(input.items) || input.items.length > 3) {
    throw new BannerRequestError("unexpected");
  }
  if (!input.items.every(validBanner)) {
    throw new BannerRequestError("unexpected");
  }
  const banners: HomepageBanner[] = input.items;
  if (
    banners.some(
      (banner, index) =>
        index > 0 &&
        (banner.position <= banners[index - 1].position || banner.id === banners[index - 1].id),
    ) ||
    new Set(banners.map((banner) => banner.id)).size !== banners.length
  ) {
    throw new BannerRequestError("unexpected");
  }
  return banners;
}

export async function fetchBanners(signal: AbortSignal): Promise<HomepageBanner[]> {
  let response: Response;
  try {
    response = await fetch("/api/v1/home/banners", {
      signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new BannerRequestError(error instanceof TypeError ? "network" : "unexpected");
  }
  if (!response.ok) {
    throw new BannerRequestError(
      response.status === 408 || response.status === 504
        ? "timeout"
        : [502, 503].includes(response.status)
          ? "unavailable"
          : "unexpected",
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new BannerRequestError(error instanceof TypeError ? "network" : "unexpected");
  }
  return parseBannerResponse(data);
}
