export function productHref(slug: string, offerId?: string): string {
  const path = `/products/${encodeURIComponent(slug)}`;
  return offerId ? `${path}?offerId=${encodeURIComponent(offerId)}` : path;
}
