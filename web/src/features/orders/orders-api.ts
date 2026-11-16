import { offerIdPattern } from "../../shared/product/identity";

export type OrderSummary = {
  id: string;
  createdAt: string;
  totalCents: number;
  currency: "EUR";
  itemCount: number;
};
export type OrderItem = {
  id: string;
  productName: string;
  sellerName: string;
  unitPriceCents: number;
  keyCode: string;
};
export type OrderDetail = Omit<OrderSummary, "itemCount"> & { items: OrderItem[] };
export type OrderPage = { items: OrderSummary[]; page: number; pageSize: number; total: number };
export type OrderFailure = "unauthorized" | "missing" | "unavailable" | "unexpected";
export class OrderRequestError extends Error {
  constructor(public readonly kind: OrderFailure) {
    super(kind);
    this.name = "OrderRequestError";
  }
}
function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function positive(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
}
function text(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function summary(v: unknown): v is Omit<OrderSummary, "itemCount"> & Record<string, unknown> {
  return (
    record(v) &&
    typeof v.id === "string" &&
    offerIdPattern.test(v.id) &&
    typeof v.createdAt === "string" &&
    Number.isFinite(Date.parse(v.createdAt)) &&
    positive(v.totalCents) &&
    v.currency === "EUR"
  );
}
export function parseOrder(v: unknown): OrderDetail {
  if (
    !summary(v) ||
    !record(v) ||
    !Array.isArray(v.items) ||
    v.items.length < 1 ||
    v.items.length > 10
  )
    throw new OrderRequestError("unexpected");
  let total = 0;
  const ids = new Set<string>();
  const items = v.items.map((item: unknown): OrderItem => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !offerIdPattern.test(item.id) ||
      ids.has(item.id) ||
      !text(item.productName) ||
      !text(item.sellerName) ||
      !text(item.keyCode) ||
      !positive(item.unitPriceCents)
    )
      throw new OrderRequestError("unexpected");
    ids.add(item.id);
    total += item.unitPriceCents;
    return {
      id: item.id,
      productName: item.productName,
      sellerName: item.sellerName,
      keyCode: item.keyCode,
      unitPriceCents: item.unitPriceCents,
    };
  });
  if (!Number.isSafeInteger(total) || total !== v.totalCents)
    throw new OrderRequestError("unexpected");
  return { id: v.id, createdAt: v.createdAt, totalCents: v.totalCents, currency: "EUR", items };
}
export function parseOrders(v: unknown): OrderPage {
  if (
    !record(v) ||
    !Array.isArray(v.items) ||
    !positive(v.page) ||
    !positive(v.pageSize) ||
    v.pageSize > 50 ||
    typeof v.total !== "number" ||
    !Number.isSafeInteger(v.total) ||
    v.total < 0 ||
    v.items.length > v.pageSize
  )
    throw new OrderRequestError("unexpected");
  const items = v.items.map((item: unknown): OrderSummary => {
    if (!summary(item) || !record(item) || !positive(item.itemCount))
      throw new OrderRequestError("unexpected");
    return {
      id: item.id,
      createdAt: item.createdAt,
      totalCents: item.totalCents,
      currency: "EUR",
      itemCount: item.itemCount,
    };
  });
  return { items, page: v.page, pageSize: v.pageSize, total: v.total };
}
async function read(path: string, signal: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(path, {
      signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw new OrderRequestError(
        response.status === 401
          ? "unauthorized"
          : response.status === 404
            ? "missing"
            : [502, 503, 504].includes(response.status)
              ? "unavailable"
              : "unexpected",
      );
    return await response.json();
  } catch (error) {
    if (signal.aborted || error instanceof OrderRequestError) throw error;
    throw new OrderRequestError("unavailable");
  }
}
export async function fetchOrders(page: number, signal: AbortSignal) {
  return parseOrders(await read(`/api/v1/orders?page=${page}`, signal));
}
export async function fetchOrder(id: string, signal: AbortSignal) {
  if (!offerIdPattern.test(id)) throw new OrderRequestError("missing");
  const order = parseOrder(await read(`/api/v1/orders/${id}`, signal));
  if (order.id.toLowerCase() !== id.toLowerCase()) throw new OrderRequestError("unexpected");
  return order;
}
