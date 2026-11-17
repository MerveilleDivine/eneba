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
}) => {¶»§q«^