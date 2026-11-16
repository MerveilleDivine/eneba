import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckoutRequestError, parsePurchaseResult, placeCheckoutOrder } from "./checkout-api";
import type { CheckoutAttempt } from "./checkout-attempt";

const attempt: CheckoutAttempt = {
  buyerId: "10000000-0000-4000-8000-000000000001",
  key: "20000000-0000-4000-8000-000000000001",
  lines: [
    {
      offerId: "30000000-0000-4000-8000-000000000001",
      quantity: 1,
      expectedUnitPriceCents: 1250,
    },
  ],
};
const order = {
  orderId: "40000000-0000-4000-8000-000000000001",
  totalCents: 1250,
};

afterEach(() => vi.unstubAllGlobals());

describe("simulated purchase API", () => {
  it("posts only exact server-quoted cents with same-origin credentials and the stable key", async () => {
    const mocked = vi.fn().mockResolvedValue(new Response(JSON.stringify(order), { status: 200 }));
    vi.stubGlobal("fetch", mocked);
    expect(await placeCheckoutOrder(attempt)).toEqual(order);
    const [path, config] = mocked.mock.calls[0];
    expect(path).toBe("/api/v1/checkout");
    expect(config.method).toBe("POST");
    expect(config.credentials).toBe("same-origin");
    expect(config.headers["Idempotency-Key"]).toBe(attempt.key);
    expect(JSON.parse(config.body)).toEqual({ lines: attempt.lines });
    expect(JSON.stringify(config)).not.toContain("password");
  });

  it("rejects malformed or inflated success payloads and never displays keys", () => {
    expect(parsePurchaseResult(order)).toEqual(order);
    for (const result of [
      { ...order, totalCents: 0 },
      { ...order, totalCents: 12.5 },
      { ...order, orderId: "invalid" },
      { ...order, demoCode: "secret" },
    ]) {
      expect(() => parsePurchaseResult(result)).toThrow(CheckoutRequestError);
    }
  });

  it.each([
    [409, "PRICE_CHANGED", "price-changed"],
    [409, "OUT_OF_STOCK", "sold-out"],
    [409, "IDEMPOTENCY_CONFLICT", "idempotency-conflict"],
    [401, "unauthorized", "unauthorized"],
    [503, "service_unavailable", "unavailable"],
    [504, "error", "timeout"],
  ] as const)("maps %i %s safely to %s", async (status, code, kind) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code, message: "private diagnostics" } }), {
          status,
        }),
      ),
    );
    await expect(placeCheckoutOrder(attempt)).rejects.toMatchObject({ kind });
  });

  it("never turns a network ambiguity into a new checkout attempt", async () => {
    const mocked = vi.fn().mockRejectedValue(new TypeError("network error"));
    vi.stubGlobal("fetch", mocked);
    await expect(placeCheckoutOrder(attempt)).rejects.toMatchObject({
      kind: "network",
    });
    await expect(placeCheckoutOrder(attempt)).rejects.toMatchObject({
      kind: "network",
    });
    expect(mocked.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      mocked.mock.calls[1][1].headers["Idempotency-Key"],
    );
  });
});
