import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const featuredOffer = "30000000-0000-4000-8000-000000000006";
const cheaperOffer = "30000000-0000-4000-8000-000000000005";
const destination = `/products/neon-circuit?offerId=${featuredOffer}`;

test("a non-cheapest homepage Deal retains its seller through history, reload and clearing", async ({
  page,
}) => {
  await page.goto("/");
  const deal = page
    .getByRole("region", { name: "Deals worth discovering" })
    .getByRole("link", { name: /Neon Circuit/ });
  await expect(deal).toHaveAttribute("href", destination);
  await deal.click();
  const orbit = page.getByRole("radio", { name: /Orbit Games/ });
  const northern = page.getByRole("radio", { name: /Northern Pixel/ });
  const choice = page.getByRole("status", { name: "Your seller choice" });
  await expect(orbit).toBeChecked();
  await expect(choice).toContainText("€16.60");
  await expect(page.getByText("€14.10", { exact: true })).toHaveCount(2);
  await orbit.focus();
  await orbit.press("ArrowUp");
  await expect(northern).toBeChecked();
  await expect(northern).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`offerId=${cheaperOffer}$`));
  await page.goBack();
  await expect(orbit).toBeChecked();
  await expect(choice).toContainText("€16.60");
  await page.goForward();
  await expect(northern).toBeChecked();
  await page.reload();
  await expect(northern).toBeChecked();
  await page.getByRole("button", { name: "Clear offer selection" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/products\/neon-circuit$/);
  await expect(page.getByRole("heading", { name: "Compare seller offers" })).toBeFocused();
  await expect(page.locator('input[name="seller-offer"]:checked')).toHaveCount(0);
  await page.getByRole("link", { name: "← Back to home" }).click();
  await expect(page).toHaveURL("/");
});

test("a modified Deal link opens the same offer in a new tab and preserves origin focus", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const link = page
    .getByRole("region", { name: "Deals worth discovering" })
    .getByRole("link", { name: /Neon Circuit/ });
  await link.focus();
  const [other] = await Promise.all([
    context.waitForEvent("page"),
    link.click({ modifiers: ["Control"] }),
  ]);
  try {
    await expect(other).toHaveURL(destination);
    await expect(other.getByRole("radio", { name: /Orbit Games/ })).toBeChecked();
    await expect(other.getByRole("status", { name: "Your seller choice" })).toContainText("€16.60");
    await expect(page).toHaveURL("/");
    await expect(link).toBeFocused();
  } finally {
    await other.close();
  }
});

test("the product snapshot supersedes an older homepage price without changing the chosen offer", async ({
  page,
}) => {
  await page.route("**/api/v1/products/neon-circuit", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const offer = data.offers.find((o: { offerId: string }) => o.offerId === featuredOffer);
    expect(offer.priceCents).toBe(1660);
    offer.priceCents = 1760;
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  const deal = page
    .getByRole("region", { name: "Deals worth discovering" })
    .getByRole("link", { name: /Neon Circuit/ });
  await expect(deal).toContainText("€16.60");
  await deal.click();
  await expect(page.getByRole("radio", { name: /Orbit Games/ })).toBeChecked();
  const choice = page.getByRole("status", { name: "Your seller choice" });
  await expect(choice).toContainText("€17.60");
  await expect(choice).not.toContainText("€16.60");
  await expect(page).toHaveURL(destination);
});

test("an offer removed since the homepage read is never silently replaced", async ({ page }) => {
  await page.route("**/api/v1/products/neon-circuit", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.offers = data.offers.filter((o: { offerId: string }) => o.offerId !== featuredOffer);
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  await page
    .getByRole("region", { name: "Deals worth discovering" })
    .getByRole("link", { name: /Neon Circuit/ })
    .click();
  await expect(page.getByRole("alert")).toContainText("No replacement has been selected");
  await expect(page.locator('input[name="seller-offer"]:checked')).toHaveCount(0);
  await expect(page).toHaveURL(destination);
  await page.getByRole("button", { name: "Clear offer selection" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Compare seller offers" })).toBeFocused();
});

test("empty seller lists and failed artwork retain useful game details", async ({ page }) => {
  await page.route("**/api/v1/products/neon-circuit", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.product.available = false;
    data.product.lowestPriceCents = null;
    data.offers = [];
    await route.fulfill({ response, json: data });
  });
  await page.route("**/images/covers/neon-circuit.webp", (route) => route.abort());
  await page.goto("/products/neon-circuit");
  await expect(page.getByRole("heading", { name: "Neon Circuit", exact: true })).toBeVisible();
  await expect(page.getByText("Artwork unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No active seller offers" })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Your seller choice" })).toContainText(
    "No seller offers are available right now.",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("global search from a product returns to real tolerant catalog results", async ({ page }) => {
  await page.goto(destination);
  await expect(page.getByRole("radio", { name: /Orbit Games/ })).toBeChecked();
  const search = page.getByRole("searchbox", { name: "Search games" });
  await search.fill("solr");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/catalog\?q=solr$/);
  await expect(
    page.getByRole("region", { name: "Game results" }).getByRole("link", { name: /Solar Drift/ }),
  ).toBeVisible();
});

async function checkLayout(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  const clipped = await page.locator("main button, main input").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left < -1 ||
          rect.right > innerWidth + 1 ||
          element.scrollWidth > element.clientWidth + 1
        );
      })
      .map((element) => element.textContent),
  );
  expect(clipped).toEqual([]);
  const splitPrices = await page.locator("main strong, main del, main p").evaluateAll((elements) =>
    elements
      .filter((element) => {
        if (!element.textContent?.trim().startsWith("€")) return false;
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length !== 1;
      })
      .map((element) => element.textContent),
  );
  expect(splitPrices).toEqual([]);
  for (const [element, word] of [
    [
      page
        .getByRole("radio", { name: /Northern Pixel/ })
        .locator("..")
        .locator("strong")
        .first(),
      "Northern",
    ],
    [page.getByRole("button", { name: "Clear offer selection" }), "selection"],
  ] as const) {
    const lines = await element.evaluate((node, text) => {
      const content = node.firstChild!;
      const start = content.textContent!.indexOf(text);
      const range = document.createRange();
      range.setStart(content, start);
      range.setEnd(content, start + text.length);
      return range.getClientRects().length;
    }, word);
    expect(lines, `ordinary word ${word} must not split`).toBe(1);
  }
  const hiddenSkipLink = await page
    .getByRole("link", { name: "Skip to content" })
    .evaluate((element) => ({
      focused: element === document.activeElement,
      bottom: element.getBoundingClientRect().bottom,
    }));
  if (!hiddenSkipLink.focused)
    expect(
      hiddenSkipLink.bottom,
      "unfocused skip link stays above the viewport",
    ).toBeLessThanOrEqual(0);
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
}

for (const width of [320, 360, 768, 1280]) {
  test(`product comparison remains readable at ${width}px and 200 percent text`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(destination);
    await expect(page.getByRole("radio", { name: /Orbit Games/ })).toBeChecked();
    const cover = page.locator("main img");
    await expect(cover).toHaveJSProperty("complete", true);
    expect(await cover.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(
      0,
    );
    await checkLayout(page, width);
    await page.screenshot({
      path: testInfo.outputPath(`product-${width}.jpg`),
      fullPage: true,
      quality: 85,
      animations: "disabled",
    });
    await page.addStyleTag({ content: ":root { font-size: 200%; }" });
    await checkLayout(page, width);
    await page.screenshot({
      path: testInfo.outputPath(`product-${width}-200pct.jpg`),
      fullPage: true,
      quality: 85,
      animations: "disabled",
    });
    if (width === 320)
      await page
        .getByRole("region", { name: "Compare seller offers" })
        .screenshot({ path: testInfo.outputPath("product-320-200pct-offers.jpg"), quality: 85 });
    await page.getByRole("radio", { name: /Northern Pixel/ }).click();
    await expect(page.getByRole("radio", { name: /Northern Pixel/ })).toBeChecked();
    await expect(page.getByRole("status", { name: "Your seller choice" })).toContainText("€14.10");
    await expect(page.getByRole("searchbox", { name: "Search games" })).toBeVisible();
  });
}
