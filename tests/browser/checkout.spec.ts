import { expect, test } from "@playwright/test";

const offerId = "30000000-0000-4000-8000-000000000001";
const buyerId = "10000000-0000-4000-8000-000000000001";
const orderId = "40000000-0000-4000-8000-000000000001";
const buyer = {
  id: buyerId,
  email: "buyer@example.test",
  displayName: "Sample Buyer",
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/orders/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: orderId,
        createdAt: "2026-11-16T12:00:00Z",
        totalCents: 1250,
        currency: "EUR",
        items: [
          {
            id: orderId,
            productName: "Solar Drift",
            sellerName: "Orbit Games",
            unitPriceCents: 1250,
            keyCode: "DEMO-NOT-REDEEMABLE",
          },
        ],
      }),
    }),
  );
});
function quoted(price = 1250, available = true) {
  return {
    currency: "EUR",
    totalCents: available ? price : null,
    lines: [
      {
        offerId,
        quantity: 1,
        productSlug: "solar-drift",
        productName: "Solar Drift",
        edition: "Standard",
        platform: "steam",
        region: "global",
        sellerName: "Orbit Games",
        sellerRatingPercent: 96,
        unitPriceCents: price,
        lineTotalCents: available ? price : null,
        available,
      },
    ],
  };
}
async function saveCart(page: import("@playwright/test").Page) {
  await page.addInitScript((id) => {
    if (window.localStorage.getItem("eneba:cart:v1") === null) {
      window.localStorage.setItem(
        "eneba:cart:v1",
        JSON.stringify([{ offerId: id, slug: "solar-drift", quantity: 1 }]),
      );
    }
  }, offerId);
}
async function quoteRoute(
  page: import("@playwright/test").Page,
  reply: () => ReturnType<typeof quoted>,
) {
  await page.route("**/api/v1/cart/quote", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(reply()),
    }),
  );
}

test("guest signs in, returns to checkout, and places one order without losing the cart", async ({
  page,
}) => {
  await saveCart(page);
  let signedIn = false;
  await quoteRoute(page, () => quoted());
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: signedIn ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify(signedIn ? { user: buyer } : { error: { code: "unauthorized" } }),
    }),
  );
  await page.route("**/api/v1/auth/login", (route) => {
    signedIn = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: buyer }),
    });
  });
  const submitted: string[] = [];
  await page.route("**/api/v1/checkout", async (route) => {
    submitted.push(route.request().headers()["idempotency-key"]);
    expect(route.request().postDataJSON()).toEqual({
      lines: [{ offerId, quantity: 1, expectedUnitPriceCents: 1250 }],
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ orderId, totalCents: 1250 }),
    });
  });
  await page.goto("/checkout");
  await expect(page.getByText("Sold by Orbit Games")).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await page.getByLabel("Email address").fill(buyer.email);
  await page.getByLabel("Password").fill("A long sample password 123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText("€12.50").first()).toBeVisible();
  await expect(page.getByText("Simulated purchase — no payment is taken.")).toBeVisible();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Your order & keys" })).toBeVisible();
  await expect(page.getByText(orderId)).toBeVisible();
  expect(submitted).toHaveLength(1);
  await page.reload();
  await expect(page.getByText(orderId)).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("eneba:cart:v1") || "[]")),
  ).toEqual([]);
});

test("uncertain response keeps the original idempotency key after reload", async ({ page }) => {
  await saveCart(page);
  await quoteRoute(page, () => quoted());
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: buyer }),
    }),
  );
  let calls = 0;
  const keys: string[] = [];
  await page.route("**/api/v1/checkout", async (route) => {
    calls++;
    keys.push(route.request().headers()["idempotency-key"]);
    if (calls === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "database details",
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ orderId, totalCents: 1250 }),
      });
    }
  });
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
  expect(await page.evaluate(() => localStorage.getItem("eneba:cart:v1"))).toContain(offerId);
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry previous order" })).toBeVisible();
  await page.getByRole("button", { name: "Retry previous order" }).click();
  await expect(page.getByText(orderId)).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await expect(page.getByText("database details")).toHaveCount(0);
});

test("price change forces a new quote before allowing purchase", async ({ page }) => {
  await saveCart(page);
  let price = 1250;
  await quoteRoute(page, () => quoted(price));
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: buyer }),
    }),
  );
  let requests = 0;
  await page.route("**/api/v1/checkout", async (route) => {
    requests++;
    if (requests === 1) {
      price = 1400;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "PRICE_CHANGED" } }),
      });
    } else {
      expect(route.request().postDataJSON().lines[0].expectedUnitPriceCents).toBe(1400);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ orderId, totalCents: 1400 }),
      });
    }
  });
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText("€14.00").first()).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("prices have changed");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText(orderId)).toBeVisible();
  expect(requests).toBe(2);
});

test("sold-out items cannot enter checkout and the page fits 320px with enlarged text", async ({
  page,
}) => {
  await saveCart(page);
  await quoteRoute(page, () => quoted(1250, false));
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: buyer }),
    }),
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/checkout");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(page.getByRole("button", { name: "Place order" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Edit cart" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
