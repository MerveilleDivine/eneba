import { expect, test } from "@playwright/test";
import { platforms, regions, sorts } from "../../web/src/features/catalog/catalog-query";

test("sorting preserves keyboard focus across request replacement", async ({ page }) => {
  await page.goto("/catalog");
  await expect(page.getByText("16 games", { exact: true })).toBeVisible();
  const sort = page.getByLabel("Sort by");
  await sort.focus();
  await sort.selectOption("price_desc");
  await expect(sort).toBeFocused();
  await expect(page.getByRole("heading", { name: "Deep Signal" })).toBeVisible();
  await expect(sort).toBeFocused();
  await sort.press("Home");
  await expect(sort).toHaveValue("relevance");
  await expect(sort).toBeFocused();
});

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

test("API-rejected filters offer reset without showing server details", async ({ page }) => {
  await page.route("**/api/v1/products?*", async (route) => {
    await route.fulfill({ status: 400, body: "private server validation" });
  });
  await page.goto("/catalog?platform=steam");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Those filters couldn't be applied");
  await expect(alert).not.toContainText("private server validation");
  await page.unroute("**/api/v1/products?*");
  await page.getByRole("link", { name: "Reset filters" }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
});

test("unexpected server errors offer retry without claiming a temporary outage", async ({
  page,
}) => {
  await page.route("**/api/v1/products?*", async (route) => {
    await route.fulfill({ status: 500, body: "private stack trace" });
  });
  await page.goto("/catalog");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("We couldn't load the games");
  await expect(alert).not.toContainText("temporarily unavailable");
  await expect(alert).not.toContainText("private stack trace");
  await page.unroute("**/api/v1/products?*");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
});

test("a rejected default catalog request keeps retry and alternate search available", async ({
  page,
}) => {
  await page.route("**/api/v1/products?*", async (route) => {
    await route.fulfill({ status: 400, body: "private validation detail" });
  });
  await page.goto("/catalog");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("choose a platform or search");
  await expect(alert).not.toContainText("private validation detail");
  await expect(alert.getByRole("link", { name: "Reset filters" })).toHaveCount(0);

  await page.unroute("**/api/v1/products?*");
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
});

for (const { status, heading } of [
  { status: 502, heading: "Games are temporarily unavailable" },
  { status: 504, heading: "The catalog took too long to respond" },
]) {
  test(`gateway response ${status} has an accurate recovery message`, async ({ page }) => {
    await page.route("**/api/v1/products?*", async (route) => {
      await route.fulfill({ status, body: "private proxy detail" });
    });
    await page.goto("/catalog");
    const alert = page.getByRole("alert");
    await expect(alert.getByRole("heading", { name: heading })).toBeVisible();
    await expect(alert).not.toContainText("private proxy detail");
    await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible();
  });
}

test("an obsolete catalog request cannot replace the current result", async ({ page }) => {
  let releaseOld!: () => void;
  let oldStarted!: () => void;
  const oldRelease = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  const oldSeen = new Promise<void>((resolve) => {
    oldStarted = resolve;
  });
  let oldOutcome: "delivered" | "aborted" | undefined;

  await page.route("**/api/v1/products?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("platform") !== "steam") {
      await route.continue();
      return;
    }
    oldStarted();
    await oldRelease;
    const failure = route.request().failure();
    if (failure) {
      expect(failure.errorText).toMatch(/ERR_ABORTED/i);
      oldOutcome = "aborted";
      return;
    }
    try {
      await route.fulfill({ status: 503, body: "private obsolete outage" });
      oldOutcome = "delivered";
    } catch (error) {
      const cancellation = route.request().failure();
      if (!cancellation) throw error;
      expect(cancellation.errorText).toMatch(/ERR_ABORTED/i);
      oldOutcome = "aborted";
    }
  });

  await page.goto("/catalog?platform=steam");
  await oldSeen;
  await page.getByLabel("Platform").selectOption("xbox");
  await expect(page.getByRole("heading", { name: "The Last Outpost" })).toBeVisible();
  releaseOld();
  await expect.poll(() => oldOutcome).toMatch(/^(delivered|aborted)$/);
  await expect(page.getByRole("heading", { name: "The Last Outpost" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("private obsolete outage")).toHaveCount(0);
});

test("equivalent catalog links do not refetch the same results", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/products") {
      requests.push(request.url());
    }
  });
  await page.goto("/catalog?sort=name_asc");
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  // Strict Mode may start and cancel an extra initial request.
  const initialRequests = requests.length;
  expect(initialRequests).toBeGreaterThan(0);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Browse games" })
    .click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  expect(requests).toHaveLength(initialRequests);
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
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Browse games" })
    .click();
  await expect(search).toHaveValue("");
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/catalog$/);
});

test("search accepts 100 Unicode code points without truncating surrogate pairs", async ({
  page,
}) => {
  await page.goto("/catalog");
  const search = page.getByRole("searchbox", { name: "Search games" });
  const characters = "🧠".repeat(100);
  await search.fill(characters + "🧠");
  await expect(search).toHaveValue(characters);
  await search.press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(characters);
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

test("product covers keep stable styling across sorting and narrow screens", async ({ page }) => {
  await page.goto("/catalog");
  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Solar Drift" }),
  });
  await expect(card).toBeVisible();
  const cover = card.locator("[data-variation]");
  const originalVariation = await cover.getAttribute("data-variation");
  expect(originalVariation).toMatch(/^[0-3]$/);
  await expect(cover).toHaveCSS("background-image", /linear-gradient/);
  await expect(page.getByRole("complementary", { name: "Catalog filters" })).toHaveCSS(
    "border-style",
    "solid",
  );

  await page.getByLabel("Sort by").selectOption("price_asc");
  await expect(card).toBeVisible();
  await expect(cover).toHaveAttribute("data-variation", originalVariation!);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
