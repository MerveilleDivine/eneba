import { useSyncExternalStore } from "react";
import { offerIdPattern, validProductSlug } from "../../shared/product/identity";

const STORAGE_KEY = "eneba:cart:v1";
export const MAX_CART_LINES = 10;

export type CartLine = {
  offerId: string;
  quantity: 1;
  slug: string;
};
export type AddCartResult = "added" | "already-added" | "full" | "storage-error" | "invalid";

const empty: readonly CartLine[] = Object.freeze([]);
let cached: readonly CartLine[] | null = null;
const subscribers = new Set<() => void>();

function validLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    Object.keys(entry).length === 3 &&
    typeof entry.offerId === "string" &&
    offerIdPattern.test(entry.offerId) &&
    typeof entry.slug === "string" &&
    validProductSlug(entry.slug) &&
    entry.quantity === 1
  );
}

export function parseCart(value: unknown): readonly CartLine[] {
  if (!Array.isArray(value) || value.length > MAX_CART_LINES || !value.every(validLine))
    return empty;
  const unique = new Set(value.map((line: CartLine) => line.offerId.toLowerCase()));
  if (unique.size !== value.length) return empty;
  return value.map((line: CartLine) => ({
    offerId: line.offerId.toLowerCase(),
    quantity: 1,
    slug: line.slug,
  }));
}

function fromStorage(): readonly CartLine[] {
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? empty : parseCart(JSON.parse(raw));
  } catch {
    return empty;
  }
}

function getSnapshot(): readonly CartLine[] {
  if (cached === null) cached = fromStorage();
  return cached;
}

function publish(lines: readonly CartLine[]) {
  cached = lines;
  for (const notify of subscribers) notify();
}

function syncStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  const next = fromStorage();
  if (JSON.stringify(getSnapshot()) !== JSON.stringify(next)) publish(next);
}

function subscribe(notify: () => void) {
  const first = subscribers.size === 0;
  subscribers.add(notify);
  if (first && typeof window !== "undefined") window.addEventListener("storage", syncStorage);
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0 && typeof window !== "undefined")
      window.removeEventListener("storage", syncStorage);
  };
}

export function useCart(): readonly CartLine[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => empty);
}

function persist(lines: readonly CartLine[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    publish(lines);
    return true;
  } catch {
    return false;
  }
}

export function addCartLine(slug: string, offerId: string): AddCartResult {
  if (!validProductSlug(slug) || !offerIdPattern.test(offerId)) return "invalid";
  const id = offerId.toLowerCase();
  const current = fromStorage();
  if (current.some((line) => line.offerId === id)) return "already-added";
  if (current.length >= MAX_CART_LINES) return "full";
  const next: readonly CartLine[] = [...current, { slug, offerId: id, quantity: 1 }];
  return persist(next) ? "added" : "storage-error";
}

export function removeCartLine(offerId: string): boolean {
  if (!offerIdPattern.test(offerId)) return false;
  const current = fromStorage();
  const next = current.filter((line) => line.offerId !== offerId.toLowerCase());
  if (next.length === current.length) return true;
  return persist(next);
}
