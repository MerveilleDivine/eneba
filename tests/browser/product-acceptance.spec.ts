import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const featuredOffer = "30000000-0000-4000-8000-000000000006";
const cheaperOffer = "30000000-0000-4000-8000-000000000005";
const destination = `/products/neon-circuit?offerId=${featuredOffer}`;

test("a non-cheapest homepage Deal retains its seller through history, reload and clearing", async ({
  page,
}) => {
  await page.goto("/");
  const deal = page
    .getByRole("region", { name: "Deals worth discovering" })
    .getByRole("link", { name: /Neon Circuit/ });
  await expect(deal).toHaveAttribute("href", destination);
  await deal.click();
  const orbit = page.getByRole("radio", { name: /Orbit Games/ });
  const northern = page.getByRole("radio", { name: /Northern Pixel/ });
  const choice = page.getByRole("status", { name: "Your seller choice" });
  await expect(orbit).toBeChecked();
  await expect(choice).toContainText("â‚¬16.60");
  await expect(page.getByText("â‚¬14.10", { exact: true })).toHaveCount(2);
  await orbit.focus();
  await orbit.press("ArrowUp");
  await expect(northern).toBeChecked();
  await expect(northern).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`offerId=${cheaperOffer}$`));
  await page.goBack();
  await expect(orbit).toBeChecked();
  await expect(choice).toContainText("â‚¬16.60");
  await page.goForward();
  await expect(northern).toBeChecked();
  await page.reload();
  await expect(northern).toBeChecked();
  await page.getByRo¶»§q«^