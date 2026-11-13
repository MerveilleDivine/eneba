import type { Platform, Region } from "./catalog-query";

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
