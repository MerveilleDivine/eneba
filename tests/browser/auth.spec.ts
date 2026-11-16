import { expect, test } from "@playwright/test";

test("account registration form is usable at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create demo account" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("guest account prompts sign-in and does not invent a user", async ({ page }) => {
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "unauthorized", message: "Sign in." } }),
    });
  });
  await page.goto("/account");
  await expect(page.getByText("Sign in to view your buyer account.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("account service outage offers a retry without showing private content", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/v1/auth/me", async (route) => {
    calls++;
    await route.fulfill({
      status: calls === 1 ? 503 : 401,
      contentType: "application/json",
      body: calls === 1 ? "private database diagnostic" : "{}",
    });
  });
  await page.goto("/account");
  await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByText("private database diagnostic")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Sign in to view your buyer account.")).toBeVisible();
});
