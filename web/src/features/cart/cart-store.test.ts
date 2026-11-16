import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  MAX_CART_LINES,
  addCartLine,
  parseCart,
  removeCartLine,
  removePurchasedCartLines,
  useCart,
} from "./cart-store";

const offer = "30000000-0000-4000-8000-000000000001";
const offerAt = (n: number) =>
  "30000000-0000-4000-8000-" + n.toString().padStart(12, "0");

beforeEach(() => window.localStorage.clear());

describe("browser-owned client cart", () => {
  it("persists only offer identity, slug and fixed quantity", () => {
    expect(addCartLine("solar-drift", offer)).toBe("added");
    expect(JSON.parse(localStorage.getItem("eneba:cart:v1") || "null")).toEqual(
      [{ offerId: offer, slug: "solar-drift", quantity: 1 }],
    );
    expect(addCartLine("solar-drift", offer.toUpperCase())).toBe(
      "already-added",
    );
    expect(removeCartLine(offer)).toBe(true);
    expect(JSON.parse(localStorage.getItem("eneba:cart:v1") || "null")).toEqual(
      [],
    );
  });

  it("removes only purchased lines and preserves selections added later", () => {
    expect(addCartLine("solar-drift", offer)).toBe("added");
    expect(addCartLine("solar-drift", offerAt(2))).toBe("added");
    expect(removePurchasedCartLines([offer])).toBe(true);
    expect(JSON.parse(localStorage.getItem("eneba:cart:v1") || "[]")).toEqual([
      { offerId: offerAt(2), slug: "solar-drift", quantity: 1 },
    ]);
  });

  it("rejects corrupt, duplicate and tampered storage without trusting prices", () => {
    expect(
      parseCart([{ offerId: offer, slug: "solar-drift", quantity: 2 }]),
    ).toEqual([]);
    expect(
      parseCart([
        { offerId: offer, slug: "solar-drift", quantity: 1, priceCents: 1 },
      ]),
    ).toEqual([]);
    expect(
      parseCart([
        { offerId: offer, slug: "solar-drift", quantity: 1 },
        { offerId: offer.toUpperCase(), slug: "solar-drift", quantity: 1 },
      ]),
    ).toEqual([]);
    expect(parseCart({ offerId: offer })).toEqual([]);
    expect(addCartLine("../invalid", offer)).toBe("invalid");
    expect(addCartLine("solar-drift", "not-an-offer")).toBe("invalid");
  });

  it("enforces a maximum of ten distinct one-unit offers", () => {
    for (let i = 1; i <= MAX_CART_LINES; i++) {
      expect(addCartLine("solar-drift", offerAt(i))).toBe("added");
    }
    expect(addCartLine("solar-drift", offerAt(11))).toBe("full");
    expect(
      JSON.parse(localStorage.getItem("eneba:cart:v1") || "null"),
    ).toHaveLength(10);
  });

  it("does not invent saved state if browser persistence throws", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("storage disabled");
    };
    try {
      expect(addCartLine("solar-drift", offer)).toBe("storage-error");
      expect(localStorage.getItem("eneba:cart:v1")).toBeNull();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe("mounted cart synchronization", () => {
  it("reconciles storage edits made while no cart listeners were mounted", async () => {
    const initial = renderHook(() => useCart());
    await waitFor(() => expect(initial.result.current).toEqual([]));
    initial.unmount();
    window.localStorage.setItem(
      "eneba:cart:v1",
      JSON.stringify([{ offerId: offer, slug: "solar-drift", quantity: 1 }]),
    );
    const resumed = renderHook(() => useCart());
    await waitFor(() =>
      expect(resumed.result.current.map((line) => line.offerId)).toEqual([
        offer,
      ]),
    );
    resumed.unmount();
  });

  it("observes remote-tab changes and clears the cart on storage deletion", async () => {
    const mounted = renderHook(() => useCart());
    await waitFor(() => expect(mounted.result.current).toEqual([]));
    act(() => {
      window.localStorage.setItem(
        "eneba:cart:v1",
        JSON.stringify([{ offerId: offer, slug: "solar-drift", quantity: 1 }]),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: "eneba:cart:v1" }),
      );
    });
    await waitFor(() => expect(mounted.result.current).toHaveLength(1));
    act(() => {
      window.localStorage.removeItem("eneba:cart:v1");
      window.dispatchEvent(
        new StorageEvent("storage", { key: "eneba:cart:v1" }),
      );
    });
    await waitFor(() => expect(mounted.result.current).toHaveLength(0));
    mounted.unmount();
  });
});
