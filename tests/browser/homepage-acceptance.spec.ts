import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const bannerRegion = "Featured games";
const bestSellerRegion = "Best sellers in this demo";
const dealRegion = "Deals worth discovering";

test("the complete homepage reads three real Go/PostgreSQL sources", async ({ page, request }) => {
  const paths = ["/api/v1/home/banners", "/api/v1/home/best-sellers", "/api/v1/home/deals"];
  const responses = await Promise.all(paths.map((path) => request.get(path)));
  for (const response of responses) {
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  }
  const [banners, bestSellers, deals] = await Promise.all(
    responses.map((response) => response.json()),
  );
  expect(banners.items).toHaveLength(1);
  expect(bestSellers.items).toHaveLength(4);
  expect(deals.items).toHaveLength(3);
  expect(banners.items[0].linkHref).toBe("/catalog");
  expect(bestSellers.items[0].demoWeeklySales).toBe(120);
  expect(deals.items[0]).toMatchObject({
    sellerName: "Purple Lantern",
    priceCents: 1273,
    listPriceCents: 1873,
    discountPercent: 32,
  });

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  const banner = page.getByRole("region", { name: bannerRegion });
  const ranked = page.getByRole("region", { name: bestSellerRegion });
  const offers = page.getByRole("region", { name: dealRegion });
  await expect(banner.getByRole("heading", { name: banners.items[0].headline })).toBeVisible();
  await expect(ranked.getByRole("listitem")).toHaveCount(bestSellers.items.length);
  await expect(offers.getByRole("listitem")).toHaveCount(deals.items.length);
  await expect(offers).toContainText(deals.items[0].sellerName);
  await expect(offers).toContainText("€12.73");
  await expect(offers).toContainText("€18.73");
  await expect(offers).toContainText("offer not selected");
  expect(pageErrors).toEqual([]);
});

test("simultaneous homepage failures recover independently", async ({ page }) => {
  const paths = ["banners", "best-sellers", "deals"] as const;
  for (const path of paths) {
    await page.route(`**/api/v1/home/${path}`, (route) =>
      route.fulfill({ status: 503, body: "private database credentials" }),
    );
  }
  await page.goto("/");
  const banner = page.getByRole("region", { name: bannerRegion });
  const ranked = page.getByRole("region", { name: bestSellerRegion });
  const deals = page.getByRole("region", { name: dealRegion });
  await expect(banner.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(ranked.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(deals.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByRole("searchbox", { name: "Search games" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("private database credentials");

  await page.unroute("**/api/v1/home/banners");
  await banner.getByRole("button", { name: "Try again" }).click();
  await expect(banner.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  await expect(ranked.getByRole("alert")).toBeVisible();
  await expect(deals.getByRole("alert")).toBeVisible();

  await page.unroute("**/api/v1/home/best-sellers");
  await ranked.getByRole("button", { name: "Try best sellers again" }).click();
  await expect(ranked.getByRole("listitem")).toHaveCount(4);
  await expect(deals.getByRole("alert")).toBeVisible();
  await expect(banner.getByRole("heading", { name: "Discover your next world" })).toBeVisible();

  await page.unroute("**/api/v1/home/deals");
  await deals.getByRole("button", { name: "Try deals again" }).click();
  await expect(deals.getByRole("listitem")).toHaveCount(3);
  await expect(ranked.getByRole("listitem")).toHaveCount(4);
  await expect(banner.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  await expect(deals.getByRole("heading", { name: dealRegion })).toBeFocused();
});

test("stalled Deals time out and recover independently", async ({ page }) => {
  // Leave the first request pending; the homepage hook must cancel it after
  // six seconds. Subsequent requests use the unmodified real API.
  let first = true;
  await page.route("**/api/v1/home/deals", async (route) => {
    if (first) {
      first = false;
      return;
    }
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const deals = page.getByRole("region", { name: dealRegion });
  await expect(deals.getByRole("status")).toContainText("Loading deals");
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await expect(deals.getByRole("alert")).toContainText("took too long to load", {
    timeout: 10000,
  });
  await deals.getByRole("button", { name: "Try deals again" }).click();
  await expect(deals.getByRole("listitem")).toHaveCount(3);
  await expect(deals.getByRole("heading", { name: dealRegion })).toBeFocused();
});

for (const width of [320, 360, 768, 1280]) {
  test(`homepage cross-layer visual at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const banners = page.getByRole("region", { name: bannerRegion });
    const bestSellers = page.getByRole("region", { name: bestSellerRegion });
    const deals = page.getByRole("region", { name: dealRegion });
    await expect(banners.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
    await expect(bestSellers.getByRole("listitem")).toHaveCount(4);
    await expect(deals.getByRole("listitem")).toHaveCount(3);

    // Force lazy artwork below the fold to load before recording full-page evidence.
    for (const cover of await page.locator("main img").all()) {
      await cover.scrollIntoViewIfNeeded();
      await expect(cover).toHaveJSProperty("complete", true);
      expect(await cover.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(
        0,
      );
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(report.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    expect(
      await deals
        .locator("li > a > div")
        .first()
        .evaluate((card) => getComputedStyle(card).transitionDuration),
    ).toBe("0s");
    await page.screenshot({
      path: testInfo.outputPath(`homepage-${width}.jpg`),
      fullPage: true,
      quality: 82,
      animations: "disabled",
    });

    if (width === 320 || width === 768) {
      await page.addStyleTag({ content: ":root { font-size: 200%; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      for (const section of [bestSellers, deals]) {
        await expect(section.getByRole("link").first()).toBeVisible();
      }
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(scan.violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`homepage-${width}-200pct.jpg`),
        fullPage: true,
        quality: 82,
        animations: "disabled",
      });
    }
  });
}
