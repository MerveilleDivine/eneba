import { expect, test } from "@playwright/test";

test("same-origin proxy serves live Go health and catalog contracts", async ({ request }) => {
  for (const [path, status] of [
    ["/healthz", "ok"],
    ["/readyz", "ready"],
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(await response.json()).toEqual({ status });
    expect(response.headers()["x-request-id"]).toBeTruthy();
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["content-type"]).toContain("application/json");
  }

  const catalog = await request.get("/api/v1/products?sort=name_asc&pageSize=1");
  expect(catalog.status()).toBe(200);
  expect(catalog.headers()["x-request-id"]).toBeTruthy();
  expect(catalog.headers()["cache-control"]).toBe("no-store");
  expect(catalog.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await catalog.json()).toMatchObject({
    currency: "EUR",
    page: 1,
    pageSize: 1,
    total: 16,
  });

  const rejected = await request.get("/api/v1/products?sort=not-a-sort");
  expect(rejected.status()).toBe(400);
  expect(await rejected.json()).toMatchObject({ error: { code: "invalid_query" } });
  expect(rejected.headers()["cache-control"]).toBe("no-store");

  const method = await request.post("/api/v1/products");
  expect(method.status()).toBe(405);
  expect(method.headers()["allow"]).toBe("GET, HEAD");
  expect(await method.json()).toMatchObject({ error: { code: "method_not_allowed" } });

  const missing = await request.get("/api/v1/no-such-resource");
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toMatchObject({ error: { code: "not_found" } });
});

test("real inventory-aware prices and sold-out products match the browser", async ({
  page,
  request,
}) => {
  const priced = await request.get("/api/v1/products?sort=price_desc&pageSize=12");
  expect(priced.status()).toBe(200);
  const descending = await priced.json();
  expect(descending).toMatchObject({ total: 16, page: 1, pageSize: 12, currency: "EUR" });
  expect(descending.items[0]).toMatchObject({
    name: "Deep Signal",
    lowestPriceCents: 3304,
    available: true,
  });
  expect(Object.keys(descending.items[0]).sort()).toEqual([
    "available",
    "coverUrl",
    "edition",
    "id",
    "lowestPriceCents",
    "name",
    "platform",
    "region",
    "slug",
  ]);
  expect(JSON.stringify(descending)).not.toContain("DEMO-NONREDEEMABLE");

  await page.goto("/catalog?sort=price_desc");
  const deepSignal = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Deep Signal" }),
  });
  await expect(deepSignal).toBeVisible();
  await expect(deepSignal).toContainText("€33.04");

  const soldOut = await request.get("/api/v1/products?q=lunra&pageSize=12");
  expect(soldOut.status()).toBe(200);
  const soldOutData = await soldOut.json();
  expect(soldOutData).toMatchObject({ total: 1, currency: "EUR" });
  expect(soldOutData.items[0]).toMatchObject({
    name: "Lunar Legacy",
    available: false,
    lowestPriceCents: null,
  });

  await page.goto("/catalog?q=lunra");
  const lunar = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Lunar Legacy" }),
  });
  await expect(lunar).toContainText("Currently unavailable");
  await expect(lunar).toContainText("Sold out");
  await expect(lunar.getByText("From", { exact: true })).toHaveCount(0);
});

test("live database filter and empty states agree with the storefront", async ({
  page,
  request,
}) => {
  const filters = "platform=steam&region=global&minPriceCents=1136&maxPriceCents=1136";
  const api = await request.get(`/api/v1/products?${filters}&pageSize=12`);
  expect(api.status()).toBe(200);
  const data = await api.json();
  expect(data).toMatchObject({ total: 1, page: 1, pageSize: 12 });
  expect(data.items).toHaveLength(1);
  expect(data.items[0]).toMatchObject({
    name: "Solar Drift",
    platform: "steam",
    region: "global",
    lowestPriceCents: 1136,
  });

  await page.goto(`/catalog?${filters}`);
  await expect(page.getByText("1 game", { exact: true })).toBeVisible();
  const solar = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Solar Drift" }),
  });
  await expect(solar).toContainText("€11.36");
  await expect(page.locator("article")).toHaveCount(1);

  const empty = await request.get("/api/v1/products?q=zzzzzz&pageSize=12");
  expect(empty.status()).toBe(200);
  expect(await empty.json()).toMatchObject({ items: [], total: 0 });
  await page.goto("/catalog?q=zzzzzz");
  await expect(page.getByRole("heading", { name: "No games match those filters" })).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
});

test("browser pagination covers all seeded SKUs without duplication", async ({ page, request }) => {
  const first = await request.get("/api/v1/products?sort=name_asc&page=1&pageSize=12");
  const second = await request.get("/api/v1/products?sort=name_asc&page=2&pageSize=12");
  expect(first.status()).toBe(200);
  expect(second.status()).toBe(200);
  const pageOne = await first.json();
  const pageTwo = await second.json();
  expect(pageOne).toMatchObject({ total: 16, page: 1, pageSize: 12 });
  expect(pageTwo).toMatchObject({ total: 16, page: 2, pageSize: 12 });
  expect(pageOne.items).toHaveLength(12);
  expect(pageTwo.items).toHaveLength(4);
  expect(new Set([...pageOne.items, ...pageTwo.items].map((item) => item.id)).size).toBe(16);

  await page.goto("/catalog?page=2");
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(page.locator("article")).toHaveCount(4);
  for (const item of pageTwo.items) {
    await expect(page.getByRole("heading", { name: item.name, exact: true })).toBeVisible();
  }
});
