import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const bannerRegion = "Featured games";
const bestSellerRegion = "Best sellers";
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
  await expect(offers).toContainText("View offer");
  expect(pageErrors).toEqual([]);
});

test("simultaneous homepage outages recover quietly and independently", async ({ page }) => {
  const paths = ["banners", "best-sellers", "deals"] as const;
  const counts: Record<(typeof paths)[number], number> = {
    banners: 0,
    "best-sellers": 0,
    deals: 0,
  };
  for (const path of paths) {
    await page.route(`**/api/v1/home/${path}`, (route) =>
      counts[path]++ === 0
        ? route.fulfill({ status: 503, body: "private database credentials" })
        : route.continue(),
    );
  }
  await page.goto("/");
  const banners = page.getByRole("region", { name: bannerRegion });
  const ranked = page.getByRole("region", { name: bestSellerRegion });
  const deals = page.getByRole("region", { name: dealRegion });
  await expect(page.getByRole("searchbox", { name: "Search games" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(banners.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  await expect(ranked.getByRole("listitem")).toHaveCount(4);
  await expect(deals.getByRole("listitem")).toHaveCount(3);
  await expect(page.locator("main")).not.toContainText("private database credentials");
  for (const path of paths) expect(counts[path]).toBeGreaterThanOrEqual(2);
});

test("a delayed Deals request keeps its skeleton beyond six seconds", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/home/deals", async (route) => {
    await gate;
    try {
      await route.continue();
    } catch {
      // An abandoned request can be aborted after navigating away.
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const deals = page.getByRole("region", { name: dealRegion });
  await expect(deals.getByRole("status")).toContainText("Loading deals");
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  try {
    await page.waitForTimeout(6_500);
    await expect(deals.getByRole("status")).toContainText("Loading deals");
    await expect(deals.getByRole("alert")).toHaveCount(0);
  } finally {
    release();
  }
  await expect(deals.getByRole("listitem")).toHaveCount(3);
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
      const search = page.getByRole("searchbox", { name: "Search games" });
      await expect(search).toBeVisible();
      expect(
        await search.evaluate((element) => element.getBoundingClientRect().width),
      ).toBeGreaterThan(95);
      for (const section of [bestSellers, deals]) {
        await expect(section.getByRole("link").first()).toBeVisible();
      }
      // No advertised EUR amount may break mid-price at 200% text, even
      // when the overall page has no horizontal scrollbar.
      const splitPrices = await deals.locator("li strong").evaluateAll((prices) =>
        prices
          .filter((price) => {
            const range = document.createRange();
            range.selectNodeContents(price);
            return range.getClientRects().length > 1;
          })
          .map((price) => price.textContent?.trim()),
      );
      expect(splitPrices).toEqual([]);
      const headingWordLines = await deals
        .getByRole("heading", { name: "Deals worth discovering" })
        .evaluate((heading) => {
          const text = heading.firstChild!;
          const word = "discovering";
          const start = text.textContent!.indexOf(word);
          const range = document.createRange();
          range.setStart(text, start);
          range.setEnd(text, start + word.length);
          return range.getClientRects().length;
        });
      expect(headingWordLines, "ordinary heading words must remain readable at enlarged text").toBe(
        1,
      );
      const widerFontLines = await deals
        .getByRole("heading", { name: "Deals worth discovering" })
        .evaluate((heading) => {
          const previous = heading.style.fontFamily;
          heading.style.fontFamily = "monospace";
          const text = heading.firstChild!;
          const word = "discovering";
          const start = text.textContent!.indexOf(word);
          const range = document.createRange();
          range.setStart(text, start);
          range.setEnd(text, start + word.length);
          const lines = range.getClientRects().length;
          heading.style.fontFamily = previous;
          return lines;
        });
      expect(widerFontLines, "a wider fallback font must fit without splitting the word").toBe(1);
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
