import { expect, test } from "@playwright/test";

for (const width of [1440, 768, 390, 320]) {
  test(`marketplace navigation and storefront at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Best sellers", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Shop by platform" })).toBeVisible();
    const featuredImage = page
      .getByRole("region", { name: "Featured games" })
      .locator("img")
      .first();
    await expect(featuredImage).toHaveJSProperty("complete", true);
    expect(
      await featuredImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath(`storefront-home-${width}.png`) });
    const menu = page.getByRole("button", { name: "Open navigation" });
    if (await menu.isVisible()) {
      await menu.click();
      await expect(page.getByRole("link", { name: "Orders & keys", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await menu.click();
    }
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Browse games", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Explore games", exact: true })).toBeVisible();
    const filters = page.getByRole("button", { name: "Filters", exact: true });
    if (await filters.isVisible()) {
      await expect(page.getByLabel("Platform", { exact: true })).not.toBeVisible();
      await filters.click();
    }
    await page.getByLabel("Platform", { exact: true }).selectOption("steam");
    await expect(page).toHaveURL(/platform=steam/);
    if (await filters.isVisible()) await filters.click();
    await expect(page.getByRole("heading", { name: "Solar Drift", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`storefront-catalog-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("heading", { name: "Solar Drift", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Compare seller offers", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`storefront-product-${width}.png`) });
  });
}
