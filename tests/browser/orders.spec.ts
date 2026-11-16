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

test("a held order response keeps the receipt skeleton without revealing keys", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/orders/*", async (route) => {
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(order),
    });
  });
  await page.goto(`/orders/${id}`, { waitUntil: "domcontentloaded" });
  const status = page.getByRole("status");
  await expect(status).toContainText("Loading your order");
  await expect(page.getByLabel("Nonredeemable key")).toHaveCount(0);
  try {
    await page.waitForTimeout(6_500);
    await expect(status).toContainText("Loading your order");
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByLabel("Nonredeemable key")).toHaveValue(code);
});

for (const width of [360, 1280]) {
  test(`receipt and key layout are usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/v1/orders/*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(order) }),
    );
    await page.goto(`/orders/${id}`);
    await expect(page.getByLabel("Nonredeemable key")).toHaveValue(code);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`receipt-${width}.jpg`),
      fullPage: true,
      quality: 82,
      animations: "disabled",
    });
  });
}
