import type { Sort } from "./catalog-query";
export { platformLabels, regionLabels } from "../../shared/product/identity";

export const sortLabels: Record<Sort, string> = {
  relevance: "Relevance",
  name_asc: "Name A–Z",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};
