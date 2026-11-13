import { expect, test } from "@playwright/test";
import { platforms, regions, sorts } from "../../web/src/features/catalog/catalog-query";

test("global search uses the real API and finds typo matches", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/catalog");
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search games" });
  await search.fill("circut");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=circut/);
  await expect(page.getByRole("heading", { name: "Neon Circuit" })).toBeVisible();
  await expect(page.getByText("1 game", { exact: true })).toBeVisible();
  await search.fill("lunra");
  await search.press("Enter");
  await expect(page.getByRole("heading", { name: "Lunar Legacy" })).toBeVisible();
  await expect(page.getByText("Currently unavailable")).toBeVisible();
  expect(errors).toEqual([]);
});

test("filters, prices, sorting, pagination and history use URL state", async ({ page }) => {
  await page.goto("/catalog");
  await expect(page.getByText("16 games", { exact: true })).toBeVisible();
  await page.getByLabel("Platform").selectOption("steam");
  await expect(page).toHaveURL(/platform=steam/);
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await page.getByLabel("Region").selectOption("global");
  await expect(page).toHaveURL(/region=global/);
  await page.getByLabel("Min").fill("11.36");
  await page.getByLabel("Max").fill("11.36");
  await page.getByRole("button", { name: "Apply price" }).click();
  await expect(page).toHaveURL(/minPriceCents=1136/);
  await expect(page.getByText("1 game", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/minPriceCents/);
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next" })).toBeVisible();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await page.getByLabel("Sort by").selectOption("price_desc");
  await expect(page).toHaveURL(/sort=price_desc/);
  await expect(page.getByRole("heading", { name: "Deep Signal" })).toBeVisible();
});

test("service errors recover without clearing filters", async ({ page }) => {
  await page.route("**/api/v1/products?*", async (route) => {
    await route.fulfill({ status: 503, body: "internal-only-data" });
  });
  await page.goto("/catalog?platform=steam");
  await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByText("internal-only-data")).toHaveCount(0);
  await page.unroute("**/api/v1/products?*");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await expect(page).toHaveURL(/platform=steam/);
});

test("invalid links recover without an API call", async ({ page }) => {
  await page.goto("/catalog?sort=not-a-sort");
  await expect(page.getByRole("alert")).toContainText("sorting option");
  await page.getByRole("link", { name: "Reset catalog" }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
});

test("debounced typing preserves focus and browser search history", async ({ page }) => {
  await page.goto("/catalog");
  const search = page.getByRole("searchbox", { name: "Search games" });
  await search.focus();
  await search.fill("sol");
  await expect(page).toHaveURL(/q=sol$/);
  await expect(search).toBeFocused();
  await search.pressSequentially("ar", { delay: 40 });
  await expect(page).toHaveURL(/q=solar$/);
  await expect(search).toHaveValue("solar");
  await expect(search).toBeFocused();
  await page.goBack();
  await expect(search).toHaveValue("sol");
  await page.goForward();
  await expect(search).toHaveValue("solar");
});

test("filter navigation cancels an uncommitted search draft", async ({ page }) => {
  await page.goto("/catalog");
  const search = page.getByRole("searchbox", { name: "Search games" });
  await search.fill("solar");
  await page.getByLabel("Platform").selectOption("steam");
  await expect(page).toHaveURL(/platform=steam/);
  await expect(search).toHaveValue("");
  await page.waitForTimeout(450);
  await expect(page).not.toHaveURL(/q=solar/);
});

test("navigating to the same catalog URL cancels pending search", async ({ page }) => {
  await page.goto("/catalog");
  const search = page.getByRole("searchbox", { name: "Search games" });
  await search.fill("solar");
  await page.getByRole("link", { name: "Eneba demo catalog" }).click();
  await expect(search).toHaveValue("");
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/catalog$/);
});

test("IME composition never submits an unfinished search", async ({ page }) => {
  await page.goto("/catalog");
  const search = page.getByRole("searchbox", { name: "Search games" });
  await search.dispatchEvent("compositionstart", { data: "s" });
  await search.fill("sol");
  await page.waitForTimeout(450);
  await expect(page).toHaveURL(/\/catalog$/);
  await search.dispatchEvent("compositionend", { data: "sol" });
  await expect(page).toHaveURL(/q=sol$/);
  await expect(search).toBeFocused();
});

test("submitting an unchanged search restores canonical input text", async ({ page }) => {
  await page.goto("/catalog?q=sol");
  const search = page.getByRole("searchbox", { name: "Search games" });
  await search.fill(" sol ");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=sol$/);
  await expect(search).toHaveValue("sol");
});

test("submitting immediately creates only one search history entry", async ({ page }) => {
  await page.goto("/catalog");
  const search = page.getByRole("searchbox", { name: "Search games" });
  await search.fill("solar");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/catalog\?q=solar$/);
  await page.waitForTimeout(450);
  await page.goBack();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(search).toHaveValue("");
});

test("price drafts survive unrelated filters and Clear all resets even unapplied values", async ({
  page,
}) => {
  await page.goto("/catalog?platform=steam");
  const minimum = page.getByRole("textbox", { name: "Min" });
  await minimum.fill("8.75");
  await page.getByLabel("Region").selectOption("global");
  await expect(page).toHaveURL(/region=global/);
  await expect(minimum).toHaveValue("8.75");

  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(minimum).toHaveValue("");
});

test("applying prices preserves input identity and browser history restores URL values", async ({
  page,
}) => {
  await page.goto("/catalog?platform=steam");
  const minimum = page.getByRole("textbox", { name: "Min" });
  const maximum = page.getByRole("textbox", { name: "Max" });
  const originalInput = await minimum.elementHandle();

  await minimum.fill("11.36");
  await maximum.fill("11.36");
  await minimum.press("Enter");
  await expect(page).toHaveURL(/minPriceCents=1136/);
  await expect(minimum).toHaveValue("11.36");
  await expect(minimum).toBeFocused();
  expect(await originalInput?.evaluate((element) => element.isConnected)).toBe(true);

  await page.goBack();
  await expect(minimum).toHaveValue("");
  await page.goForward();
  await expect(minimum).toHaveValue("11.36");
  expect(await originalInput?.evaluate((element) => element.isConnected)).toBe(true);
});

test("frontend catalog facets and sort values match the live Go API", async ({ request }) => {
  for (const [field, values] of [
    ["platform", platforms],
    ["region", regions],
    ["sort", sorts],
  ] as const) {
    for (const value of values) {
      const response = await request.get(`/api/v1/products?${field}=${value}&pageSize=1`);
      expect(response.status(), `${field}=${value}`).toBe(200);
      expect(await response.json()).toMatchObject({ page: 1, pageSize: 1, currency: "EUR" });
    }
  }
});
