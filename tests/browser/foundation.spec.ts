import { expect, test } from "@playwright/test";

for (const width of [1280, 768, 360]) {
  test("working shell at " + width + "px", async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 960 });
    await expect
      .poll(async () => (await page.request.get("/readyz")).status(), { timeout: 30000 })
      .toBe(200);
    await page.goto("/");
    await expect(page.getByText("Connection established")).toBeVisible();
    await expect(page.getByText("Unofficial demo")).toBeVisible();
    const response = await page.request.get("/readyz");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["x-request-id"]).toBeTruthy();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Eneba demo home" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Check connection" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Connection established")).toBeVisible();
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("foundation.png"), fullPage: true });
  });
}
