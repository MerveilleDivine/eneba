import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const id = "40000000-0000-4000-8000-000000000001";
const code = "DEMO-NONREDEEMABLE-OWNER-ONLY";
const order = {
  id,
  createdAt: "2026-11-16T12:00:00Z",
  totalCents: 1250,
  currency: "EUR",
  items: [
    {
      id,
      productName: "Solar Drift",
      sellerName: "Orbit Games",
      unitPriceCents: 1250,
      keyCode: code,
    },
  ],
};

test("receipt and key survive reload with accessible copy fallback", async ({ page }) => {
  await page.route("**/api/v1/orders/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(order) }),
  );
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }),
  );
  await page.goto(`/orders/${id}`);
  const key = page.getByLabel("Nonredeemable key");
  await expect(key).toHaveValue(code);
  await expect(page.getByText("Sold by Orbit Games")).toBeVisible();
  await page.getByRole("button", { name: "Copy key" }).click();
  await expect(page.getByRole("status")).toContainText("Copy wasn't available");
  await expect(key).toBeFocused();
  await page.reload();
  await expect(key).toHaveValue(code);
  const stored = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(stored).not.toContain(code);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("another tab's session change removes a previously displayed key", async ({ page }) => {
  let allowed = true;
  await page.route("**/api/v1/orders/*", (route) =>
    route.fulfill({
      status: allowed ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify(allowed ? order : { error: { code: "unauthorized" } }),
    }),
  );
  await page.goto(`/orders/${id}`);
  await expect(page.getByLabel("Nonredeemable key")).toHaveValue(code);
  allowed = false;
  await page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "eneba:session-change", newValue: "changed" }),
    ),
  );
  await expect(page.getByLabel("Nonredeemable key")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute(
    "href",
    `/sign-in?next=${encodeURIComponent("/orders/" + id)}`,
  );
});

test("history contains receipts without keys and opens the selected order", async ({ page }) => {
  await page.route("**/api/v1/orders?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          { id, createdAt: order.createdAt, totalCents: 1250, currency: "EUR", itemCount: 1 },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    }),
  );
  await page.route("**/api/v1/orders/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(order) }),
  );
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Orders & keys" })).toBeVisible();
  await expect(page.getByLabel("Nonredeemable key")).toHaveCount(0);
  await page.getByRole("link", { name: "View order & keys" }).click();
  await expect(page.getByLabel("Nonredeemable key")).toHaveValue(code);
});
