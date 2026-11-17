import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const bannerRegion = "Featured games";
const bestSellerRegion = "Best sellers";
const dealRegion = "Deals worth discovering";

test("the complete homepage reads three real Go/PostgreSQL sources", async ({ page, request }) => {
  const paths = ["/api/v1/home/banners", "/api/v1/home/best-sellers", "/api/v1/home/deals"];
  const responses = await Promise.all(paths.map((path) => request.get(path)));
  for (const response of responses) {
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  }
  const [banners, bestSellers, deals] = await Promise.all(
    responses.map((response) => response.json()),
  );
  expect(banners.items).toHaveLength(1);
  expect(bestSellers.items).toHaveLength(4);
  expect(deals.items).toHaveLength(3);
  expect(banners.items[0].linkHref).toBe("/catalog");
  expect(bestSellers.items[0].demoWeeklySales).toBe(120);
  expect(deals.items[0]).toMatchObject({
    sellerName: "Purple Lantern",
    priceCents: 1273,
    listPriceCents: 1873,
    discountPercent: 32,
  });

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  const banner = page.getByRole("region", { name: bannerRegion });
  const ranked = page.getByRole("region", { name: bestSellerRegion });
  const off¶»§q«^