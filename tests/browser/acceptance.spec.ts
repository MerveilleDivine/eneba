import { expect, test } from "@playwright/test";

test("offline browsing keeps skeletons and recovers without losing filters", async ({
  page,
  context,
}, testInfo) => {
  await page.goto("/catalog?platform=steam");
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await context.setOffline(true);
  try {
    await page.getByLabel("Region").selectOption("global");
    await expect(page.getByRole("status")).toContainText("Loading games");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByLabel("Platform")).toHaveValue("steam");
    await expect(page.getByLabel("Region")).toHaveValue("global");
    await page.screenshot({
      path: testInfo.outputPath("catalog-offline.jpg"),
      fullPage: true,
      quality: 85,
    });
  } finally {
    await context.setOffline(false);
  }
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/platform=steam&region=global/);
  await page.screenshot({
    path: testInfo.outputPath("catalog-recovered.jpg"),
    fullPage: true,
    quality: 85,
  });
  await page.goBack();
  await expect(page).toHaveURL(/\/catalog\?platform=steam$/);
  await expect(page.getByLabel("Region")).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
});

test("modified pagination opens a new tab without moving the original focus", async ({
  page,
  context,
}) => {
  await page.goto("/catalog");
  const next = page.getByRole("link", { name: "Next", exact: true });
  await next.focus();
  const [other] = await Promise.all([
    context.waitForEvent("page"),
    next.click({ modifiers: ["Control"] }),
  ]);
  try {
    await expect(other).toHaveURL(/page=2/);
    await expect(other.getByText("Page 2 of 2")).toBeVisible();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(next).toBeFocused();
  } finally {
    await other.close();
  }
});

for (const width of [320, 360, 768, 1280]) {
  test(`catalog remains usable with 200 percent text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/catalog");
    await expect(page.getByText("16 games", { exact: true })).toBeVisible();
    await page.addStyleTag({ content: ":root { font-size: 200%; }" });
    const filters = page.getByRole("button", { name: "Filters", exact: true });
    if (await filters.isVisible()) {
      await expect(filters).toHaveAttribute("aria-expanded", "false");
      await filters.click();
    }
    const horizontalOverflow = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            className: typeof element.className === "string" ? element.className : "",
            text: element.textContent?.trim().slice(0, 32),
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
          };
        })
        .filter((element) => element.right > innerWidth + 1 || element.left < -1)
        .slice(0, 12),
      overflowingContents: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          text: element.textContent?.trim().slice(0, 32),
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }))
        .slice(0, 12),
    }));
    expect(
      horizontalOverflow.document,
      `Horizontal overflow details: ${JSON.stringify(horizontalOverflow)}`,
    ).toBeLessThanOrEqual(horizontalOverflow.viewport);
    for (const label of ["Platform", "Region", "Min", "Max", "Sort by"]) {
      const control = page.getByRole(label === "Min" || label === "Max" ? "textbox" : "combobox", {
        name: label,
        exact: true,
      });
      await expect(control).toBeVisible();
      const fits = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        const contentHeight =
          element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        context.font = style.font;
        const text =
          element instanceof HTMLSelectElement
            ? element.selectedOptions[0].label
            : (element as HTMLInputElement).placeholder;
        // Reserve space for Chromium's native select arrow as well as CSS padding.
        const contentWidth =
          element.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight) -
          (element instanceof HTMLSelectElement ? 20 : 0);
        return (
          contentHeight >= parseFloat(style.fontSize) &&
          contentWidth >= context.measureText(text).width
        );
      });
      expect(fits, `${label} text must fit its control`).toBe(true);
    }
    const clippedCovers = await page.locator("article [data-variation]").evaluateAll((covers) =>
      covers
        .filter((cover) => {
          const text = cover.querySelector<HTMLElement>('[aria-hidden="true"]')!;
          const frame = cover.getBoundingClientRect();
          const overlay = text.getBoundingClientRect();
          return overlay.top < frame.top - 1 || text.scrollWidth > text.clientWidth + 1;
        })
        .map((cover) => cover.textContent?.trim()),
    );
    expect(clippedCovers).toEqual([]);
    await page.getByLabel("Platform").selectOption("steam");
    await expect(page).toHaveURL(/platform=steam/);
    await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
