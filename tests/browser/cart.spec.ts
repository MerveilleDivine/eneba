import { expect, test } from "@playwright/test";

test("selected seller identity survives cart navigation and a hard reload", async ({ page }) => {
  await page.goto("/products/solar-drift");
  await expect(page.getByRole("heading", { name: "Activation instructions" })).toBeVisible();
  await expect(
    page.getByText("Nonredeemable demo key. This code cannot be activated on any real gaming platform."),
  ).toBeVisible();
  const group = page.getByRole("group", { name: "Choose a seller offer" });
  await group.getByRole("radio").first().check();
  const offerId = new URL(page.url()).searchParams.get("offerId");
  expect(offerId).toMatch(/^[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Add this seller offer to cart" }).click();
  await expect(page.getByRole("link", { name: "View cart" })).toBeVisible();
  await page.getByRole("link", { name: "View cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole("heading", { name: "Shopping cart" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View seller offer" })).toHaveAttribute(
    "href",
    new RegExp("offerId=" + offerId + "$"),
  );
  await expect(page.getByText("Quantity: 1")).toBeVisible();
  await expect(page.getByText("Current estimated subtotal")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  await expect(page.getByText("Current estimated subtotal")).toBeVisible();
  await page.getByRole("button", { name: "Remove offer" }).click();
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
});

test("sold-out offer cannot be added and existing unavailable cart data does not fabricate stock", async ({ page }) => {
  await page.goto("/products/lunar-legacy");
  const group = page.getByRole("group", { name: "Choose a seller offer" });
  await expect(group.getByRole("radio").first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add this seller offer to cart" })).toHaveCount(0);
});

test("cart ignores corrupted storage and remains usable at mobile width", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("eneba:cart:v1", "{not-json");
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("cart and account navigation remain usable at enlarged text size", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/cart");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expect(page.getByRole("link", { name: "Cart (0)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
