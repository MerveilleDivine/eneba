import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("reads seller-specific deals and navigates through the catalog", async ({ page }) => {
  const response = await page.request.get("/api/v1/home/deals");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.currency).toBe("EUR");
  expect(data.items).toHaveLength(3);
  expect(data.items[0]).toMatchObject({
    name: "The Last Outpost",
    sellerName: "Purple Lantern",
    priceCents: 1273,
    listPriceCents: 1873,
    discountPercent: 32,
  });
  await page.goto("/");
  const shelf = page.getByRole("region", { name: "Deals worth discovering" });
  await expect(shelf.getByRole("listitem")).toHaveCount(3);
  await expect(shelf).toContainText("Offer by Purple Lantern");
  await expect(shelf).toContainText("€12.73");
  await expect(shelf).toContainText("€18.73");
  await expect(shelf).toContainText("offer not selected");
  const covers = shelf.locator("img");
  await expect(covers).toHaveCount(3);
  for (const cover of await covers.all()) {
    await cover.scrollIntoViewIfNeeded();
    await expect(cover).toHaveJSProperty("complete", true);
    expect(await cover.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(
      0,
    );
  }
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Best sellers in this demo" })).toBeVisible();
  await shelf.getByRole("link", { name: /The Last Outpost/ }).click();
  await expect(page).toHaveURL(/\/catalog\?q=The\+Last\+Outpost&platform=xbox&region=europe$/);
  const results = page.getByRole("region", { name: "Game results" });
  await expect(results.getByRole("heading", { name: "The Last Outpost" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Platform" })).toHaveValue("xbox");
  await expect(page.getByRole("combobox", { name: "Region" })).toHaveValue("europe");
});

test("a Deals failure does not hide the other homepage blocks", async ({ page }) => {
  await page.route("**/api/v1/home/deals", async (route) => {
    await route.fulfill({ status: 503, body: "private database hostname" });
  });
  await page.goto("/");
  const shelf = page.getByRole("region", { name: "Deals worth discovering" });
  await expect(shelf.getByRole("alert")).toContainText("Deals are temporarily unavailable");
  await expect(shelf).not.toContainText("private database hostname");
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await page.unroute("**/api/v1/home/deals");
  await shelf.getByRole("button", { name: "Try deals again" }).click();
  await expect(shelf.getByRole("listitem")).toHaveCount(3);
  await expect(shelf.getByRole("heading", { name: "Deals worth discovering" })).toBeFocused();
});

test("empty and malformed Deals never invent a discounted price", async ({ page }) => {
  await page.route("**/api/v1/home/deals", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], currency: "EUR" }),
    });
  });
  await page.goto("/");
  const shelf = page.getByRole("region", { name: "Deals worth discovering" });
  await expect(shelf).toContainText("There are no featured deals right now");
  await expect(shelf.getByRole("listitem")).toHaveCount(0);
  await page.unroute("**/api/v1/home/deals");
  await page.route("**/api/v1/home/deals", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            offerId: "30000000-0000-4000-8000-000000000003",
            productId: "10000000-0000-4000-8000-000000000002",
            slug: "the-last-outpost",
            name: "The Last Outpost",
            edition: "Standard",
            platform: "xbox",
            region: "europe",
            coverUrl: "/images/covers/the-last-outpost.webp",
            sellerName: "Purple Lantern",
            priceCents: 1273,
            listPriceCents: 1873,
            discountPercent: 75,
            position: 0,
          },
        ],
        currency: "EUR",
      }),
    });
  });
  await page.reload();
  await expect(shelf.getByRole("alert")).toContainText("Deals are temporarily unavailable");
  await expect(shelf.getByRole("listitem")).toHaveCount(0);
});

test("slow Deals do not block banners or Best Sellers", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/home/deals", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const shelf = page.getByRole("region", { name: "Deals worth discovering" });
  await expect(shelf.getByRole("status")).toContainText("Loading deals");
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  release();
  await expect(shelf.getByRole("listitem")).toHaveCount(3);
});

for (const width of [320, 360, 768, 1280]) {
  test("Deal cards are accessible with enlarged text at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const shelf = page.getByRole("region", { name: "Deals worth discovering" });
    await expect(shelf.getByRole("listitem")).toHaveCount(3);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    await page.addStyleTag({ content: ":root { font-size: 200%; }" });
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(width);
    const card = shelf.locator("li").first();
    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(120);
    expect(bounds!.height).toBeGreaterThan(120);
    const link = shelf.getByRole("link", { name: /The Last Outpost/ });
    await link.focus();
    await expect(link).toBeFocused();
    await expect(link).toHaveAccessibleName(/The Last Outpost/);
  });
}
