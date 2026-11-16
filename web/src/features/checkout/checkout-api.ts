import { offerIdPattern } from "../../shared/product/identity";
import type { CheckoutAttempt } from "./checkout-attempt";

export type CheckoutFailure =
  | "unauthorized"
  | "price-changed"
  | "sold-out"
  | "idempotency-conflict"
  | "invalid"
  | "unavailable"
  | "timeout"
  | "network"
  | "unexpected";

export type PurchaseResult = { orderId: string; totalCents: number };

export class CheckoutRequestError extends Error {
  constructor(public readonly kind: CheckoutFailure) {
    super(kind);
    this.name = "CheckoutRequestError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePurchaseResult(value: unknown): PurchaseResult {
  if (
    !record(value) ||
    typeof value.orderId !== "string" ||
    !offerIdPattern.test(value.orderId) ||
    typeof value.totalCents !== "number" ||
    !Number.isSafeInteger(value.totalCents) ||
    value.totalCents <= 0 ||
    Object.keys(value).some((key) => key !== "orderId" && key !== "totalCents")
  ) {
    throw new CheckoutRequestError("unexpected");
  }
  return { orderId: value.orderId.toLowerCase(), totalCents: value.totalCents };
}

async function checkoutFailure(response: Response): Promise<CheckoutFailure> {
  if (response.status === 401) return "unauthorized";
  if (response.status === 400 || response.status === 403 || response.status === 415)
    return "invalid";
  if (response.status === 408 || response.status === 504) return "timeout";
  if (response.status === 502 || response.status === 503) return "unavailable";
  if (response.status !== 409) return "unexpected";
  try {
    const payload: unknown = await response.json();
    const code = record(payload) && record(payload.error) ? payload.error.code : null;
    if (code === "PRICE_CHANGED") return "price-changed";
    if (code === "OUT_OF_STOCK") return "sold-out";
    if (code === "IDEMPOTENCY_CONFLICT") return "idempotency-conflict";
  } catch {
    // Never expose backend error bodies in checkout.
  }
  return "unexpected";
}

// A transport timeout is an unknown result, not proof of a failed transaction.
// The caller must preserve the attempt and reuse its key on retry.
export async function placeCheckoutOrder(attempt: CheckoutAttempt): Promise<PurchaseResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("/api/v1/checkout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": attempt.key,
      },
      body: JSON.stringify({ lines: attempt.lines }),
    });
    if (!response.ok) throw new CheckoutRequestError(await checkoutFailure(response));
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new CheckoutRequestError("unexpected");
    }
    return parsePurchaseResult(result);
  } catch (error) {
    if (error instanceof CheckoutRequestError) throw error;
    throw new CheckoutRequestError(controller.signal.aborted ? "timeout" : "network");
  } finally {
    window.clearTimeout(timeout);
  }
}
