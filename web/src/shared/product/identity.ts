export const platforms = ["steam", "xbox", "playstation", "nintendo", "other"] as const;
export const regions = ["global", "europe", "united-states"] as const;
export type Platform = (typeof platforms)[number];
export type Region = (typeof regions)[number];

export const platformLabels: Record<Platform, string> = {
  steam: "Steam",
  xbox: "Xbox",
  playstation: "PlayStation",
  nintendo: "Nintendo",
  other: "Other",
};
export const regionLabels: Record<Region, string> = {
  global: "Global",
  europe: "Europe",
  "united-states": "United States",
};

// The product and cart features share only stable public identifiers.
export const offerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validProductSlug(slug: string): boolean {
  return slug.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
