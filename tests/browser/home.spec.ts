import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("homepage banner reads PostgreSQL through the Go API and links to the catalog", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  const image = page.locator('img[src="/images/banners/discover-world.svg"]');
  await expect(image).toHaveCount(1);
  expect(
    await image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
  ).toBe(true);
  await page.getByRole("link", { name: "Explore games" }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole("heading", { name: "Solar Drift" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("global search from Home preserves catalog query and keyboard usability", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Search games" });
  await search.fill("circut");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/catalog\?q=circut/);
  await expect(page.getByRole("heading", { name: "Neon Circuit" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Home" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/catalog\?q=circut/);
});

test("a failed banner endpoint can retry without exposing server details", async ({ page }) => {
  await page.route("**/api/v1/home/banners", async (route) => {
    await route.fulfill({ status: 503, body: "private PostgreSQL connection" });
  });
  await page.goto("/");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Featured games are temporarily unavailable");
  await expect(alert).not.toContainText("private PostgreSQL connection");
  await expect(
    page
      .getByRole("region", { name: "Featured games" })
      .getByRole("link", { name: "Browse games" }),
  ).toBeVisible();
  await page.unroute("**/api/v1/home/banners");
  await page
    .getByRole("region", { name: "Featured games" })
    .getByRole("button", { name: "Try again" })
    .click();
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeFocused();
});

test("empty banner data shows a working browse route rather than fake content", async ({
  page,
}) => {
  await page.route("**/api/v1/home/banners", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Explore a world of games" })).toBeVisible();
  await page
    .getByRole("region", { name: "Featured games" })
    .getByRole("link", { name: "Browse games" })
    .click();
  await expect(page).toHaveURL(/\/catalog$/);
});

test("malformed or unsafe API data never creates a clickable promotion", async ({ page }) => {
  await page.route("**/api/v1/home/banners", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "50000000-0000-4000-8000-000000000001",
            headline: "Unsafe content",
            subheading: "Do not link.",
            imageUrl: "/images/banners/discover-world.svg",
            linkHref: "javascript:alert(1)",
            position: 0,
          },
        ],
      }),
    });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("We couldn't load featured games");
  await expect(page.getByRole("link", { name: "Explore games" })).toHaveCount(0);
});

test("three independently sourced banners remain reachable at enlarged mobile text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const banners = [
    {
      id: "50000000-0000-4000-8000-000000000001",
      headline: "A".repeat(120),
      subheading: "A new adventure awaits you in the catalog.",
      imageUrl: "/images/banners/discover-world.svg",
      linkHref: "/catalog?q=solar",
      position: 0,
    },
    {
      id: "50000000-0000-4000-8000-000000000002",
      headline: "Beyond the horizon",
      subheading: "Discover fictional worlds.",
      imageUrl: "/images/banners/discover-world.svg",
      linkHref: "/catalog?q=neon",
      position: 1,
    },
    {
      id: "50000000-0000-4000-8000-000000000003",
      headline: "Featured adventures",
      subheading: "Browse our game catalog.",
      imageUrl: "/images/banners/discover-world.svg",
      linkHref: "/catalog",
      position: 2,
    },
  ];
  await page.route("**/api/v1/home/banners", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: banners }),
    });
  });
  await page.goto("/");
  const articles = page.getByRole("region", { name: "Featured games" }).locator("article");
  await expect(articles).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Beyond the horizon" })).toBeVisible();
  await page.addStyleTag({ content: ":root { font-size: 200%; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const article of await articles.all()) {
    const link = article.getByRole("link", { name: "Explore games" });
    await expect(link).toBeVisible();
    const entirelyInCard = await link.evaluate((element) => {
      const linkRect = element.getBoundingClientRect();
      const cardRect = element.closest("article")?.getBoundingClientRect();
      return Boolean(
        cardRect &&
        linkRect.left >= cardRect.left - 1 &&
        linkRect.right <= cardRect.right + 1 &&
        linkRect.bottom <= cardRect.bottom + 1,
      );
    });
    expect(entirelyInCard).toBe(true);
  }
  await articles.nth(1).getByRole("link", { name: "Explore games" }).click();
  await expect(page).toHaveURL(/\/catalog\?q=neon$/);
  await expect(page.getByRole("heading", { name: "Neon Circuit" })).toBeVisible();
});

test("delayed banner response shows loading state until content arrives", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/home/banners", async (route) => {
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "50000000-0000-4000-8000-000000000001",
            headline: "Service recovered",
            subheading: "Source-driven banner copy",
            imageUrl: "/images/banners/discover-world.svg",
            linkHref: "/catalog",
            position: 0,
          },
        ],
      }),
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const banner = page.getByRole("region", { name: "Featured games" });
  await expect(banner.getByRole("status")).toContainText("Loading featured games");
  release();
  await expect(page.getByRole("heading", { name: "Service recovered" })).toBeVisible();
  await expect(banner.getByRole("status")).toHaveCount(0);
});

for (const width of [320, 360, 768, 1280]) {
  test(
    "homepage passes enlarged text and accessibility checks at " + width + "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Discover your next world" })).toBeVisible();
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(scan.violations).toEqual([]);
      await page.addStyleTag({ content: ":root { font-size: 200%; }" });
      const overflow = await page.evaluate(() => ({
        viewport: innerWidth,
        width: document.documentElement.scrollWidth,
        offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .map((element) => {
            const bounds = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              className: typeof element.className === "string" ? element.className : "",
              text: element.textContent?.trim().slice(0, 24),
              left: Math.round(bounds.left),
              right: Math.round(bounds.right),
            };
          })
          .filter((item) => item.left < -1 || item.right > innerWidth + 1)
          .slice(0, 10),
      }));
      expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport);
      const link = page.getByRole("link", { name: "Explore games" });
      await expect(link).toBeVisible();
      expect(
        await link.evaluate((element) => {
          const linkBounds = element.getBoundingClientRect();
          const cardBounds = element.closest("article")?.getBoundingClientRect();
          return Boolean(
            cardBounds &&
            linkBounds.left >= cardBounds.left - 1 &&
            linkBounds.right <= cardBounds.right + 1,
          );
        }),
      ).toBe(true);
      await link.focus();
      await expect(link).toBeFocused();
    },
  );
}
