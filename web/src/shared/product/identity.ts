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
