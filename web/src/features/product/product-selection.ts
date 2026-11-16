import { offerIdPattern } from "./product-api";

export type OfferSelection = { valid: true; offerId: string | null } | { valid: false };

// The URL contains identity only. Amounts, sellers and stock always come from
// the validated product response; there is no cheapest-offer fallback.
export function parseOfferSelection(search: string): OfferSelection {
  const params = new URLSearchParams(search);
  for (const key of params.keys()) {
    if (key !== "offerId" || params.getAll(key).length !== 1) return { valid: false };
  }
  const id = params.get("offerId");
  if (id === null) return { valid: true, offerId: null };
  return offerIdPattern.test(id) ? { valid: true, offerId: id.toLowerCase() } : { valid: false };
}
