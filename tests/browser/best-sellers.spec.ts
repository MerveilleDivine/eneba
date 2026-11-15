import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("real best-seller ranking is sourced from the Go service and links to catalog", async ({
  page,
}) => {
  const response = await page.request.get("/api/v1/home/best-sellers");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.currency).toBe("EUR");
  expect(data.items.map((item: { name: string }) => item.name)).toEqual([
    "Solar Drift",
    "Neon Circuit",
    "Echoes of Orion",
    "Midnight Protocol",
  ]);
  await page.goto("/");
  const shelf = page.getByRole("region", { name: "Best sellers in this demo" });
  await expect(shelf.getByRole("listitem")).toHaveCount(4);
  await expect(shelf.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  await shelf.getByRole("link", { name: "Find Solar Drift in the catalog" }).click();
  await expect(page).toHaveURL(/\/catalog\?q=Solar\+Drift$/);
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
});

test("best-seller failure does not disturb banners, and retry focuses its own heading", async ({
  page,
}) => {
  await page.route("**/api/v1/home/best-sellers", async (route) => {
    await route.fulfill({ status: 503, body: "private database hostname" });
  });
  await page.goto("/");
  const shelf = page.getByRole("region", { name: "Best sellers in this demo" });
  await expect(shelf.getByRole("alert")).toContainText(
    "Best sellers are temporarily unavailable",
  );
  await expect(shelf).not.toContainText("private database hostname");
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  await page.unroute("**/api/v1/home/best-sellers");
  await shelf.getByRole("button", { name: "Try best sellers again" }).click();
  await expect(shelf.getByRole("listitem")).toHaveCount(4);
  await expect(shelf.getByRole("heading", { name: "Best sellers in this demo" })).toBeFocused();
});

test("empty and unsafe best-seller payloads do not fabricate product cards", async ({ page }) => {
  await page.route("**/api/v1/home/best-sellers", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], currency: "EUR" }),
    });
  });
  await page.goto("/");
  const shelf = page.getByRole("region", { name: "Best sellers in this demo" });
  await expect(shelf).toContainText("No best sellers are featured right now");
  await expect(shelf.getByRole("listitem")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();

  await page.unroute("**/api/v1/home/best-sellers");
  await page.route("**/api/v1/home/best-sellers", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currency: "EUR",
        items: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            slug: "solar-drift",
            name: "Solar Drift",
            edition: "Standard",
            platform: "steam",
            region: "global",
            coverUrl: "/images/covers/solar-drift.webp",
            available: true,
            lowestPriceCents: null,
            demoWeeklySales: 120,
          },
        ],
      }),
    });
  });
  await page.reload();
  await expect(shelf.getByRole("alert")).toContainText("Best sellers are temporarily unavailable");
  await expect(shelf.getByRole("listitem")).toHaveCount(0);
});

test("slow best-seller requests do not block the independent hero", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/home/best-sellers", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const shelf = page.getByRole("region", { name: "Best sellers in this demo" });
  await expect(shelf.getByRole("status")).toContainText("Loading best sellers");
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  release();
  await expect(shelf.getByRole("listitem")).toHaveCount(4);
});

for (const width of [320, 360, 768, 1280]) {
  test("best-seller cards remain accessible at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const shelf = page.getByRole("region", { name: "Best sellers in this demo" });
    await expect(shelf.getByRole("listitem")).toHaveCount(4);
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(report.violations).toEqual([]);
    await page.addStyleTag({ content: ":root { font-size: 200%; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const link = shelf.getByRole("link", { name: "Find Solar Drift in the catalog" });
    await link.focus();
    await expect(link).toBeFocused();
  });
}
