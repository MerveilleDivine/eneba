import { expect, test } from "@playwright/test";

test("account registration form is usable at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeFocused();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
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

test("account service outage retries silently without showing private content", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: attempts++ === 0 ? 503 : 401,
      contentType: "application/json",
      body: attempts === 1 ? "private database diagnostic" : "{}",
    }),
  );
  await page.goto("/account");
  await expect(page.getByText("Sign in to view your buyer account.")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("private database diagnostic")).toHaveCount(0);
  expect(attempts).toBeGreaterThanOrEqual(2);
});

test("buyer can register, retain a session after reload, sign out and sign back in", async ({
  page,
}) => {
  const email = `buyer-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.test`;
  const password = "A unique demo password 123!";
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Sample Buyer");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(email)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Sample Buyer")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/account");
  await expect(page.getByText("Sign in to view your buyer account.")).toBeVisible();

  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Check your account details");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(email)).toBeVisible();
});

test("registration stays accessible at 320px with 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/register");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
