import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const width of [360, 768, 1280]) {
  test(`catalog accessibility and layout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/catalog");
    await expect(page.getByText("16 games", { exact: true })).toBeVisible();
    // Full-page screenshots must include decoded lazy images below the fold.
    for (const image of await page.locator("article img").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toHaveJSProperty("naturalWidth", 432);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`catalog-${width}.jpg`),
      fullPage: true,
      quality: 85,
    });
  });
}

for (const state of ["loading", "empty", "error", "invalid", "not-found"] as const) {
  test(`catalog ${state} state has no automated accessibility violations`, async ({ page }) => {
    if (state === "loading") {
      await page.route("**/api/v1/products?*", () => {});
    }
    if (state === "error") {
      await page.route("**/api/v1/products?*", (route) => route.fulfill({ status: 500, body: "" }));
    }
    const path =
      state === "empty"
        ? "/catalog?q=no-such-game-zzzz"
        : state === "invalid"
          ? "/catalog?sort=invalid"
          : state === "not-found"
            ? "/missing-page"
            : "/catalog";
    await page.goto(path);
    if (state === "loading") await expect(page.getByRole("status")).toContainText("Loading games");
    if (state === "empty") await expect(page.getByRole("status")).toContainText("No games match");
    if (state === "error" || state === "invalid")
      await expect(page.getByRole("alert")).toBeVisible();
    if (state === "not-found")
      await expect(page.getByRole("heading", { level: 1 })).toContainText("doesn't exist");
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    if (state === "loading") await expect(page.getByRole("status")).toContainText("Loading games");
  });
}

test("the skip link moves keyboard focus into the catalog", async ({ page }) => {
  await page.goto("/catalog");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Platform")).toBeFocused();
});

test("keyboard retry preserves a useful focus target after the button disappears", async ({
  page,
}) => {
  await page.route("**/api/v1/products?*", (route) => route.fulfill({ status: 500, body: "" }));
  await page.goto("/catalog?platform=steam");
  const retry = page.getByRole("button", { name: "Try again" });
  await retry.focus();
  await page.unroute("**/api/v1/products?*");
  await retry.press("Enter");
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Browse games", exact: true })).toBeFocused();
  await expect(page).toHaveURL(/platform=steam/);
});

test("pagination returns keyboard users to the results heading", async ({ page }) => {
  await page.goto("/catalog");
  const next = page.getByRole("link", { name: "Next", exact: true });
  await next.focus();
  await next.press("Enter");
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Browse games", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Sort by")).toBeFocused();
});

test("clearing filters leaves focus on the first filter", async ({ page }) => {
  await page.goto("/catalog?platform=steam");
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  const clear = page.getByRole("button", { name: "Clear all" });
  await clear.focus();
  await clear.press("Enter");
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByLabel("Platform")).toBeFocused();
});

test("invalid prices identify and focus the field to correct", async ({ page }) => {
  await page.goto("/catalog");
  const maximum = page.getByRole("textbox", { name: "Max", exact: true });
  await maximum.fill("invalid");
  await page.getByRole("button", { name: "Apply price" }).click();
  await expect(maximum).toBeFocused();
  await expect(maximum).toHaveAttribute("aria-invalid", "true");
  await expect(maximum).toHaveAccessibleDescription(/Enter valid euro prices/);
});
