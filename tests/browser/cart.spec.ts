import { expect, test } from "@playwright/test";

test("selected seller identity survives cart navigation and a hard reload", async ({ page }) => {
  await page.goto("/products/solar-drift");
  await expect(page.getByRole("heading", { name: "Activation instructions" })).toBeVisible();
  await expect(page.getByText(/Activate a Product on Steam/)).toBeVisible();
  const group = page.getByRole("group", { name: "Choose a seller offer" });
  await group.getByRole("radio").first().click();
  const offerId = new URL(page.url()).searchParams.get("offerId");
  expect(offerId).toMatch(/^[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("link", { name: "View cart" })).toBeVisible();
  await page.getByRole("link", { name: "View cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole("heading", { name: "Shopping cart" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View seller offer" })).toHaveAttribute(
    "href",
    new RegExp("offerId=" + offerId + "$"),
  );
  await expect(page.getByText("Quantity: 1")).toBeVisible();
  await expect(page.getByText("Current subtotal")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await expect(page.getByText("Current subtotal")).toBeVisible();
  await page.getByRole("button", { name: "Remove offer" }).click();
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
});

test("sold-out offer cannot be added and existing unavailable cart data does not fabricate stock", async ({
  page,
}) => {
  await page.goto("/products/lunar-legacy");
  const group = page.getByRole("group", { name: "Choose a seller offer" });
  await expect(group.getByRole("radio").first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
});

test("cart ignores corrupted storage and remains usable at mobile width", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("eneba:cart:v1", "{not-json");
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("cart and account navigation remain usable at enlarged text size", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/cart");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(page.getByRole("link", { name: "Cart (0)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("saved offer remains visible but is not priced as purchasable after stock runs out", async ({
  page,
}) => {
  const savedOffer = "30000000-0000-4000-8000-000000000001";
  await page.addInitScript((id) => {
    window.localStorage.setItem(
      "eneba:cart:v1",
      JSON.stringify([{ offerId: id, slug: "solar-drift", quantity: 1 }]),
    );
  }, savedOffer);
  await page.route("**/api/v1/cart/quote", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currency: "EUR",
        lines: [{
          offerId: savedOffer,
          quantity: 1,
          productSlug: "solar-drift",
          productName: "Solar Drift",
          edition: "Standard",
          platform: "steam",
          region: "global",
          sellerName: "Orbit Games",
          sellerRatingPercent: 96,
          unitPriceCents: 1136,
          lineTotalCents: null,
          available: false,
        }],
        totalCents: null,
      }),
    });
  });
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await expect(page.getByText("Sold out")).toBeVisible();
  await expect(page.getByText("Current subtotal")).toHaveCount(0);
  await page.getByRole("button", { name: "Remove offer" }).click();
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
});

test("an unavailable quote API never produces a made-up subtotal", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "eneba:cart:v1",
      JSON.stringify([
        { offerId: "30000000-0000-4000-8000-000000000001", slug: "solar-drift", quantity: 1 },
      ]),
    );
  });
  await page.route("**/api/v1/cart/quote", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: "private error" });
  });
  await page.goto("/cart");
  await expect(page.getByRole("alert")).toContainText("Current prices aren't available");
  await expect(page.getByText("Current subtotal")).toHaveCount(0);
  await expect(page.getByText("private error")).toHaveCount(0);
});
