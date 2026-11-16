import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const solarOffer = "30000000-0000-4000-8000-000000000001";
test("catalog opens the exact SKU, compares real sellers and preserves URL selection", async ({
  page,
}) => {
  await page.goto("/catalog?platform=steam&region=global");
  await page
    .getByRole("link", {
      name: /Solar Drift Standard edition Steam Global From/,
    })
    .click();
  await expect(page).toHaveURL(/\/products\/solar-drift$/);
  await expect(page.getByRole("heading", { name: "Solar Drift", exact: true })).toBeFocused();
  const group = page.getByRole("group", { name: "Choose a seller offer" });
  await expect(group.getByRole("radio")).toHaveCount(2);
  await expect(group.getByRole("radio").first()).not.toBeChecked();
  const choice = group.getByRole("radio", { name: /Orbit Games/ });
  await choice.click();
  await expect(page).toHaveURL(new RegExp(`offerId=${solarOffer}$`));
  await expect(choice).toBeFocused();
  const summary = page.getByRole("status");
  await expect(summary).toContainText("Orbit Games");
  await expect(summary).toContainText("€11.36");
  await page.reload();
  await expect(group.getByRole("radio", { name: /Orbit Games/ })).toBeChecked();
  await page.getByRole("link", { name: "← Back to games" }).click();
  await expect(page).toHaveURL(/\/catalog\?platform=steam&region=global$/);
  await expect(page.getByLabel("Platform")).toHaveValue("steam");
});

test("Deep Signal shows its unavailable cheaper seller without selecting it", async ({ page }) => {
  await page.goto("/products/deep-signal?offerId=30000000-0000-4000-8000-000000000029");
  await expect(page.getByRole("alert")).toContainText("selected seller's offer is sold out");
  const sold = page.getByRole("radio", { name: /€30.54/ });
  await expect(sold).toBeDisabled();
  await expect(sold).toBeChecked();
  await expect(page.getByText("€33.04", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("status")).toContainText(
    "Choose a seller to add this game to your cart.",
  );
  await page.getByRole("radio", { name: /€33.04/ }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("€33.04");
});

test("invalid foreign and inactive offer links never choose a replacement", async ({ page }) => {
  for (const search of [
    "?offerId=invalid",
    `?offerId=${solarOffer}`,
    "?priceCents=1",
    "?offerId=30000000-0000-4000-8000-000000000099",
  ]) {
    await page.goto("/products/neon-circuit" + search);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator('input[name="seller-offer"]:checked')).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText(
      "Choose a seller to add this game to your cart.",
    );
  }
});

test("sold out, missing and invalid products have useful recovery", async ({ page }) => {
  await page.goto("/products/lunar-legacy");
  await expect(page.getByText("Currently sold out", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(2);
  for (const radio of await page.getByRole("radio").all()) await expect(radio).toBeDisabled();
  await page.goto("/products/archived-demo");
  await expect(page.getByRole("alert")).toContainText("no longer in the catalog");
  await page.goto("/products/Bad_slug");
  await expect(page.getByRole("heading", { name: "This product link is invalid" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse games", exact: true })).toHaveCount(2);
});

test("product failures retry safely and retain the exact offer link", async ({ page }) => {
  await page.route("**/api/v1/products/neon-circuit", (route) =>
    route.fulfill({ status: 503, body: "postgres://private-password" }),
  );
  await page.goto("/products/neon-circuit?offerId=30000000-0000-4000-8000-000000000006");
  await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.locator("body")).not.toContainText("private-password");
  await page.unroute("**/api/v1/products/neon-circuit");
  await page.getByRole("button", { name: "Try product again" }).press("Enter");
  await expect(page.getByRole("radio", { name: /Orbit Games/ })).toBeChecked();
  await expect(page.getByRole("heading", { name: "Neon Circuit", exact: true })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
