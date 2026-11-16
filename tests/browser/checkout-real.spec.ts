import { expect, test } from "@playwright/test";

test.skip(
  !process.env.ENEBATEST_ISOLATED,
  "Runs only with disposable, pristine eneba_test inventory",
);

test("real guest registration and atomic purchase through PostgreSQL", async ({
  page,
}) => {
  const email = "checkout-" + Date.now() + "@example.test";
  await page.goto("/products/solar-drift");
  await expect(
    page.getByRole("heading", { name: "Solar Drift" }),
  ).toBeVisible();
  const seller = page.getByRole("group", { name: "Choose a seller offer" });
  const available = seller
    .getByRole("radio")
    .filter({ hasNot: page.locator("[disabled]") })
    .first();
  await seller.getByRole("radio").first().click();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "View cart" }).click();
  await expect(
    page.getByRole("link", { name: "Proceed to checkout" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText("Sold by", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/register\?next=/);
  await page.getByLabel("Display name").fill("Checkout Reviewer");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("A strong demo password 1234!Review");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("button", { name: "Place order" })).toBeEnabled();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/checkout") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Place order" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(Object.keys(result).sort()).toEqual(["orderId", "totalCents"]);
  expect(result.totalCents).toBeGreaterThan(0);
  await expect(page).toHaveURL(/\/checkout\/confirmation$/);
  await expect(
    page.getByRole("heading", { name: "Thank you for your order!" }),
  ).toBeVisible();
  await expect(page.getByText(result.orderId)).toBeVisible();
  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: "Your cart is empty" }),
  ).toBeVisible();
});
