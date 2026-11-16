import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attemptMatchesCart,
  clearCheckoutAttempt,
  createCheckoutAttempt,
  readCheckoutAttempt,
  readCheckoutConfirmation,
  saveCheckoutConfirmation,
} from "./checkout-attempt";
import type { CartLine } from "../cart/cart-store";
import type { CartQuote } from "../cart/quote-api";

const offerId = "30000000-0000-4000-8000-000000000001";
const buyerId = "10000000-0000-4000-8000-000000000001";
const cart: readonly CartLine[] = [{ offerId, slug: "solar-drift", quantity: 1 }];
const quote: CartQuote = {
  currency: "EUR",
  totalCents: 1250,
  lines: [
    {
      offerId,
      quantity: 1,
      productSlug: "solar-drift",
      productName: "Solar Drift",
      edition: "Standard",
      platform: "steam",
      region: "global",
      sellerName: "Orbit",
      sellerRatingPercent: 97,
      unitPriceCents: 1250,
      lineTotalCents: 1250,
      available: true,
    },
  ],
};

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("checkout attempts", () => {
  it("persists an idempotency key, exact expected line price and buyer across a reload", () => {
    const attempt = createCheckoutAttempt(buyerId, cart, quote);
    expect(attempt).not.toBeNull();
    expect(attempt?.lines).toEqual([{ offerId, quantity: 1, expectedUnitPriceCents: 1250 }]);
    expect(readCheckoutAttempt(buyerId)).toEqual(attempt);
    expect(createCheckoutAttempt(buyerId, cart, { ...quote, totalCents: 9999 })).toEqual(attempt);
    expect(attemptMatchesCart(attempt!, cart)).toBe(true);
    expect(attemptMatchesCart(attempt!, [])).toBe(false);
    expect(clearCheckoutAttempt(buyerId)).toBe(true);
    expect(readCheckoutAttempt(buyerId)).toBeNull();
  });

  it("does not create a purchase for sold out, missing, or corrupt cart lines", () => {
    expect(createCheckoutAttempt(buyerId, [], quote)).toBeNull();
    expect(createCheckoutAttempt(buyerId, cart, { ...quote, totalCents: null })).toBeNull();
    expect(
      createCheckoutAttempt(buyerId, cart, {
        ...quote,
        lines: [{ ...quote.lines[0], unitPriceCents: null }],
      }),
    ).toBeNull();
    expect(readCheckoutAttempt("not-a-uuid")).toBeNull();
  });

  it("fails closed when browser storage is unavailable", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("storage disabled");
    };
    try {
      expect(createCheckoutAttempt(buyerId, cart, quote)).toBeNull();
      expect(sessionStorage.length).toBe(0);
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("rejects tampered persisted attempt payload", () => {
    const valid = createCheckoutAttempt(buyerId, cart, quote)!;
    const key = "eneba:checkout:attempt:v1:" + buyerId;
    sessionStorage.setItem(
      key,
      JSON.stringify({
        ...valid,
        lines: [...valid.lines, { ...valid.lines[0], expectedUnitPriceCents: 1 }],
      }),
    );
    expect(readCheckoutAttempt(buyerId)).toBeNull();
  });

  it("retains only the reference, total and cart state in session confirmation", () => {
    const receipt = {
      buyerId,
      orderId: "40000000-0000-4000-8000-000000000001",
      totalCents: 1250,
      cartCleared: true,
    };
    expect(saveCheckoutConfirmation(receipt)).toBe(true);
    expect(readCheckoutConfirmation()).toEqual(receipt);
    sessionStorage.setItem("eneba:checkout:confirmation:v1", '{"orderId":"fake","totalCents":0}');
    expect(readCheckoutConfirmation()).toBeNull();
  });
});
