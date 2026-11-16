import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOrder, parseOrder, parseOrders } from "./orders-api";

const id = "40000000-0000-4000-8000-000000000001";
const item = {
  id,
  productName: "Solar Drift",
  sellerName: "Orbit Games",
  unitPriceCents: 1250,
  keyCode: "DEMO-NOT-REDEEMABLE",
};
const order = {
  id,
  createdAt: "2026-11-16T12:00:00Z",
  totalCents: 1250,
  currency: "EUR",
  items: [item],
};
afterEach(() => vi.unstubAllGlobals());
describe("order boundaries", () => {
  it("accepts a consistent receipt and empty history", () => {
    expect(parseOrder(order).items[0].keyCode).toBe(item.keyCode);
    expect(parseOrders({ items: [], page: 1, pageSize: 20, total: 0 }).items).toEqual([]);
  });
  it("rejects inconsistent totals, unsafe money, duplicate items and malformed keys", () => {
    for (const value of [
      { ...order, totalCents: 1 },
      { ...order, totalCents: Number.MAX_SAFE_INTEGER + 1 },
      { ...order, items: [item, item] },
      { ...order, items: [{ ...item, keyCode: "" }] },
    ])
      expect(() => parseOrder(value)).toThrow("unexpected");
  });
  it("uses a private cancellable request and rejects another order's response", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(order)));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    await expect(fetchOrder(id, signal)).resolves.toEqual(order);
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/orders/${id}`,
      expect.objectContaining({ signal, cache: "no-store", credentials: "same-origin" }),
    );
    fetch.mockResolvedValue(
      new Response(JSON.stringify({ ...order, id: "40000000-0000-4000-8000-000000000002" })),
    );
    await expect(fetchOrder(id, signal)).rejects.toThrow("unexpected");
  });
  it("does not surface a protected error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("sensitive database content", { status: 401 })),
    );
    await expect(fetchOrder(id, new AbortController().signal)).rejects.toThrow("unauthorized");
  });
  it("rejects inconsistent, duplicated or stale order-history pages", () => {
    const summary = {
      id,
      createdAt: order.createdAt,
      totalCents: 1250,
      currency: "EUR",
      itemCount: 1,
    };
    const valid = { items: [summary], page: 1, pageSize: 20, total: 1 };
    expect(parseOrders(valid, 1).items).toHaveLength(1);
    for (const value of [
      { ...valid, page: 2 },
      { ...valid, total: 2 },
      { ...valid, items: [summary, summary], total: 2 },
      { ...valid, items: [], total: 1 },
      { ...valid, items: [{ ...summary, itemCount: 11 }] },
      { ...valid, pageSize: 0 },
      { ...valid, page: Number.MAX_SAFE_INTEGER },
    ])
      expect(() => parseOrders(value, 1)).toThrow("unexpected");
  });

  it("rejects a response belonging to a different order-history page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [],
            page: 1,
            pageSize: 20,
            total: 0,
          }),
        ),
      ),
    );
    const { fetchOrders } = await import("./orders-api");
    await expect(fetchOrders(2, new AbortController().signal)).rejects.toThrow("unexpected");
  });
});
