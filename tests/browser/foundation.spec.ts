import { expect, test } from "@playwright/test";

for (const width of [1280, 768, 360]) {
  test("functional catalog shell at " + width + "px", async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 960 });
    await expect
      .poll(async () => (await page.request.get("/readyz")).status(), { timeout: 30000 })
      .toBe(200);
    await page.goto("/");
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(page.getByRole("heading", { name: "Explore games" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
    await expect(page.getByText("Unofficial demo")).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search games" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Eneba demo catalog" })).toBeFocused();
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("catalog-shell.png"), fullPage: true });
  });
}
