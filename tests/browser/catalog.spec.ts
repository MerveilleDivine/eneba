import { expect, test } from "@playwright/test";

test("catalog reads through the same-origin browser proxy", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("Connection established")).toBeVisible();

  const search = await page.evaluate(async () => {
    const response = await fetch("/api/v1/products?q=circut");
    return { status: response.status, body: await response.json() };
  });
  expect(search.status).toBe(200);
  expect(search.body).toMatchObject({
    currency: "EUR",
    total: 1,
    items: [{ name: "Neon Circuit", lowestPriceCents: 1410, available: true }],
  });

  const soldOut = await page.evaluate(async () => {
    const response = await fetch("/api/v1/products?q=lunra");
    return response.json();
  });
  expect(soldOut).toMatchObject({
    total: 1,
    items: [{ name: "Lunar Legacy", lowestPriceCents: null, available: false }],
  });
  const expensive = await page.request.get("/api/v1/products?sort=price_desc&pageSize=1");
  expect(expensive.status()).toBe(200);
  expect(await expensive.json()).toMatchObject({
    total: 16,
    items: [{ name: "Deep Signal", lowestPriceCents: 3304 }],
  });
  const invalid = await page.request.get("/api/v1/products?pageSize=51");
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toMatchObject({ error: { code: "invalid_query" } });
  expect(errors).toEqual([]);
});
