import type { Platform, Region, Sort } from "./catalog-query";

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

export const sortLabels: Record<Sort, string> = {
  relevance: "Relevance",
  name_asc: "Name A–Z",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};
