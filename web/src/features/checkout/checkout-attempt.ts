import { offerIdPattern } from "../../shared/product/identity";
import type { CartLine } from "../cart/cart-store";
import type { CartQuote } from "../cart/quote-api";

export type PurchaseLine = {
  offerId: string;
  quantity: 1;
  expectedUnitPriceCents: number;
};
export type CheckoutAttempt = {
  key: string;
  buyerId: string;
  lines: PurchaseLine[];
};
export type CheckoutConfirmation = {
  buyerId: string;
  orderId: string;
  totalCents: number;
  cartCleared: boolean;
};

const prefix = "eneba:checkout:attempt:v1:";
const confirmationKey = "eneba:checkout:confirmation:v1";
const safeCents = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const uuid = (value: unknown): value is string =>
  typeof value === "string" && offerIdPattern.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function validLines(value: unknown): value is PurchaseLine[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10)
    return false;
  const ids = new Set<string>();
  for (const line of value) {
    if (
      !record(line) ||
      !uuid(line.offerId) ||
      line.quantity !== 1 ||
      !safeCents(line.expectedUnitPriceCents)
    ) {
      return false;
    }
    const id = line.offerId.toLowerCase();
    if (ids.has(id)) return false;
    ids.add(id);
  }
  return true;
}

function parseAttempt(value: unknown): CheckoutAttempt | null {
  if (
    !record(value) ||
    !uuid(value.key) ||
    !uuid(value.buyerId) ||
    !validLines(value.lines)
  ) {
    return null;
  }
  return {
    key: value.key.toLowerCase(),
    buyerId: value.buyerId.toLowerCase(),
    lines: value.lines.map((line) => ({
      offerId: line.offerId.toLowerCase(),
      quantity: 1,
      expectedUnitPriceCents: line.expectedUnitPriceCents,
    })),
  };
}

export function readCheckoutAttempt(buyerId: string): CheckoutAttempt | null {
  if (!uuid(buyerId)) return null;
  try {
    const stored = sessionStorage.getItem(prefix + buyerId.toLowerCase());
    const attempt = stored === null ? null : parseAttempt(JSON.parse(stored));
    return attempt?.buyerId === buyerId.toLowerCase() ? attempt : null;
  } catch {
    return null;
  }
}

export function createCheckoutAttempt(
  buyerId: string,
  cart: readonly CartLine[],
  quote: CartQuote,
): CheckoutAttempt | null {
  if (
    !uuid(buyerId) ||
    cart.length < 1 ||
    cart.length !== quote.lines.length ||
    quote.totalCents === null
  ) {
    return null;
  }
  const previous = readCheckoutAttempt(buyerId);
  if (previous) return previous;
  const lines: PurchaseLine[] = [];
  for (let i = 0; i < cart.length; i++) {
    const quoted = quote.lines[i];
    if (
      quoted.offerId !== cart[i].offerId ||
      quoted.quantity !== 1 ||
      !quoted.available ||
      !safeCents(quoted.unitPriceCents)
    ) {
      return null;
    }
    lines.push({
      offerId: quoted.offerId,
      quantity: 1,
      expectedUnitPriceCents: quoted.unitPriceCents,
    });
  }
  const attempt: CheckoutAttempt = {
    key: crypto.randomUUID(),
    buyerId: buyerId.toLowerCase(),
    lines,
  };
  try {
    sessionStorage.setItem(prefix + attempt.buyerId, JSON.stringify(attempt));
    return attempt;
  } catch {
    return null;
  }
}

export function clearCheckoutAttempt(buyerId: string): boolean {
  if (!uuid(buyerId)) return false;
  try {
    sessionStorage.removeItem(prefix + buyerId.toLowerCase());
    return true;
  } catch {
    return false;
  }
}

export function attemptMatchesCart(
  attempt: CheckoutAttempt,
  cart: readonly CartLine[],
): boolean {
  return (
    attempt.lines.length === cart.length &&
    attempt.lines.every((line) =>
      cart.some((item) => item.offerId === line.offerId && item.quantity === 1),
    )
  );
}

export function parseCheckoutConfirmation(
  value: unknown,
): CheckoutConfirmation | null {
  if (
    !record(value) ||
    !uuid(value.buyerId) ||
    !uuid(value.orderId) ||
    !safeCents(value.totalCents) ||
    typeof value.cartCleared !== "boolean"
  ) {
    return null;
  }
  return {
    buyerId: value.buyerId,
    orderId: value.orderId,
    totalCents: value.totalCents,
    cartCleared: value.cartCleared,
  };
}

export function saveCheckoutConfirmation(
  result: CheckoutConfirmation,
): boolean {
  if (!parseCheckoutConfirmation(result)) return false;
  try {
    sessionStorage.setItem(confirmationKey, JSON.stringify(result));
    return true;
  } catch {
    return false;
  }
}

export function readCheckoutConfirmation(): CheckoutConfirmation | null {
  try {
    const saved = sessionStorage.getItem(confirmationKey);
    return saved === null ? null : parseCheckoutConfirmation(JSON.parse(saved));
  } catch {
    return null;
  }
}
