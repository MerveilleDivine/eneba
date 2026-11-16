import { platforms, regions, type Platform, type Region } from "../product/identity";

export type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  edition: string;
  platform: Platform;
  region: Region;
  coverUrl: string;
  lowestPriceCents: number | null;
  available: boolean;
};

export function isProductCoverUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  if (Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return false;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isProductSummary(value: unknown): value is ProductSummary {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    ["id", "slug", "name", "edition"].every(
      (key) => typeof item[key] === "string" && item[key].trim().length > 0,
    ) &&
    platforms.includes(item.platform as Platform) &&
    regions.includes(item.region as Region) &&
    isProductCoverUrl(item.coverUrl) &&
    typeof item.available === "boolean" &&
    (item.lowestPriceCents === null ||
      (typeof item.lowestPriceCents === "number" &&
        Number.isSafeInteger(item.lowestPriceCents) &&
        item.lowestPriceCents > 0)) &&
    item.available === (item.lowestPriceCents !== null)
  );
}
