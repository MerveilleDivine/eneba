import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Link, MemoryRouter } from "react-router";
import { App } from "../../app/App";
import type { ProductDetails } from "./product-api";

const solar: ProductDetails = {
  currency: "EUR",
  product: {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "solar-drift",
    name: "Solar Drift",
    edition: "Standard",
    platform: "steam",
    region: "global",
    coverUrl: "/images/covers/solar-drift.webp",
    description: "Fictional demo game.",
    activationInstructions: "Redeem on the listed platform.",
    available: true,
    lowestPriceCents: 1136,
  },
  offers: [
    {
      offerId: "30000000-0000-4000-8000-000000000001",
      sellerId: "20000000-0000-4000-8000-000000000001",
      sellerName: "Northern Pixel",
      sellerRatingPercent: 98,
      priceCents: 1136,
      listPriceCents: null,
      available: true,
    },
    {
      offerId: "30000000-0000-4000-8000-000000000002",
      sellerId: "20000000-0000-4000-8000-000000000002",
      sellerName: "Orbit Games",
      sellerRatingPercent: 96,
      priceCents: 1386,
      listPriceCents: null,
      available: true,
    },
  ],
};
function response(details: ProductDetails) {
  return new Response(JSON.stringify(details));
}
function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Link to="/products/deep-signal">Open Deep Signal</Link>
      <App />
    </MemoryRouter>,
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("seller changes retain focus and reuse the product snapshot", async () => {
  const read = vi.fn().mockImplementation(() => Promise.resolve(response(solar)));
  vi.stubGlobal("fetch", read);
  open("/products/solar-drift?offerId=" + solar.offers[1].offerId);
  const group = await screen.findByRole("group", { name: "Choose a seller offer" });
  const selected = within(group).getByRole("radio", { name: /Orbit Games/ });
  expect(selected).toBeChecked();
  expect(screen.getByRole("status")).toHaveTextContent("€13.86");
  const other = within(group).getByRole("radio", { name: /Northern Pixel/ });
  other.focus();
  fireEvent.click(other);
  expect(other).toHaveFocus();
  expect(other).toBeChecked();
  expect(screen.getByRole("status")).toHaveTextContent("€11.36");
  expect(read).toHaveBeenCalledTimes(1);
  expect(read.mock.calls[0][0]).toBe("/api/v1/products/solar-drift");
});

it("aborts an old product read and ignores its late success after navigation", async () => {
  let finish!: (value: Response) => void;
  let signal: AbortSignal | undefined;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const deep = {
    ...solar,
    product: {
      ...solar.product,
      id: "10000000-0000-4000-8000-000000000015",
      slug: "deep-signal",
      name: "Deep Signal",
    },
  };
  const read = vi.fn((url: string, init: RequestInit) => {
    if (url.endsWith("solar-drift")) {
      signal = init.signal as AbortSignal;
      return pending;
    }
    return Promise.resolve(response(deep));
  });
  vi.stubGlobal("fetch", read);
  open("/products/solar-drift");
  fireEvent.click(screen.getByRole("link", { name: "Open Deep Signal" }));
  await screen.findByRole("heading", { name: "Deep Signal" });
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish(response(solar));
    await Promise.resolve();
  });
  expect(screen.getByRole("heading", { name: "Deep Signal" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Solar Drift" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(read).toHaveBeenCalledTimes(2);
});

it("a client-owned deadline wins over a late product success", async () => {
  vi.useFakeTimers();
  let finish!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    ),
  );
  open("/products/solar-drift?offerId=" + solar.offers[1].offerId);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(90_000);
  });
  expect(screen.getByRole("alert")).toHaveTextContent("took too long");
  await act(async () => {
    finish(response(solar));
    await Promise.resolve();
  });
  expect(screen.getByRole("alert")).toHaveTextContent("took too long");
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});

it("renders real activation guidance and adds only the selected seller offer to the cart", async () => {
  window.localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  const read = vi.fn().mockImplementation((path: string) =>
    Promise.resolve(
      path === "/api/v1/cart/quote"
        ? new Response(
            JSON.stringify({
              currency: "EUR",
              lines: [
                {
                  offerId: solar.offers[1].offerId,
                  quantity: 1,
                  productSlug: solar.product.slug,
                  productName: solar.product.name,
                  edition: solar.product.edition,
                  platform: solar.product.platform,
                  region: solar.product.region,
                  sellerName: solar.offers[1].sellerName,
                  sellerRatingPercent: solar.offers[1].sellerRatingPercent,
                  unitPriceCents: solar.offers[1].priceCents,
                  lineTotalCents: solar.offers[1].priceCents,
                  available: true,
                },
              ],
              totalCents: solar.offers[1].priceCents,
            }),
          )
        : response(solar),
    ),
  );
  vi.stubGlobal("fetch", read);
  open("/products/solar-drift?offerId=" + solar.offers[1].offerId);
  expect(
    await screen.findByRole("heading", { name: "Activation instructions" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Redeem on the listed platform.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
  expect(screen.getByText("Added to cart.")).toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem("eneba:cart:v1") || "null")).toEqual([
    { offerId: solar.offers[1].offerId, quantity: 1, slug: "solar-drift" },
  ]);
  fireEvent.click(screen.getByRole("link", { name: "View cart" }));
  expect(await screen.findByRole("heading", { name: "Shopping cart" })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
  expect(screen.getAllByText("€13.86").length).toBeGreaterThan(0);
});

it("clearing a seller choice preserves keyboard focus on the comparison heading", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(response(solar))),
  );
  open("/products/solar-drift?offerId=" + solar.offers[1].offerId);
  const clear = await screen.findByRole("button", { name: "Clear offer selection" });
  clear.focus();
  fireEvent.click(clear);
  expect(screen.getByRole("heading", { name: "Compare seller offers" })).toHaveFocus();
  expect(screen.queryByRole("radio", { checked: true })).not.toBeInTheDocument();
});

it("sold-out products do not ask the buyer to choose an unavailable seller", async () => {
  const soldOut = {
    ...solar,
    product: { ...solar.product, available: false, lowestPriceCents: null },
    offers: solar.offers.map((offer) => ({ ...offer, available: false })),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(response(soldOut))),
  );
  open("/products/solar-drift");
  await screen.findByText("Currently sold out");
  expect(screen.getByRole("status")).toHaveTextContent("No seller offers are available right now.");
});

it("blank optional descriptions have a useful fallback", async () => {
  const blankDescription = { ...solar, product: { ...solar.product, description: " \n " } };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(response(blankDescription))),
  );
  open("/products/solar-drift");
  expect(await screen.findByText("Game details are currently unavailable.")).toBeInTheDocument();
});
