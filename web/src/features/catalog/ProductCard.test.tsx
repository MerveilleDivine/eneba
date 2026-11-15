import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductCard } from "./ProductCard";
import type { CatalogProduct } from "./catalog-api";

const solar: CatalogProduct = {
  id: "game-1",
  slug: "solar-drift",
  name: "Solar Drift",
  edition: "Standard",
  platform: "steam",
  region: "global",
  coverUrl: "/images/demo-cover.svg",
  lowestPriceCents: 1136,
  available: true,
};

const lunar: CatalogProduct = {
  ...solar,
  id: "game-2",
  slug: "lunar-legacy",
  name: "Lunar Legacy",
  lowestPriceCents: null,
  available: false,
};

function variationFor(name: string): string | null | undefined {
  const card = screen.getByRole("heading", { name }).closest("article");
  return card?.querySelector("[data-variation]")?.getAttribute("data-variation");
}

describe("product card presentation", () => {
  it("keeps each product cover variation when product order changes", () => {
    const { rerender } = render(
      <>
        <ProductCard product={solar} />
        <ProductCard product={lunar} />
      </>,
    );
    const solarVariation = variationFor("Solar Drift");
    const lunarVariation = variationFor("Lunar Legacy");
    expect(solarVariation).toMatch(/^[0-3]$/);
    expect(lunarVariation).toMatch(/^[0-3]$/);
    expect(solarVariation).not.toBe(lunarVariation);

    rerender(
      <>
        <ProductCard product={lunar} />
        <ProductCard product={solar} />
      </>,
    );
    expect(variationFor("Solar Drift")).toBe(solarVariation);
    expect(variationFor("Lunar Legacy")).toBe(lunarVariation);
  });

  it("preserves product information and fallback when cover loading fails", () => {
    const { container } = render(<ProductCard product={solar} />);
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(screen.getByText("€11.36")).toBeInTheDocument();
  });

  it("tries a replacement cover after the previous URL failed", () => {
    const { container, rerender } = render(<ProductCard product={solar} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    rerender(<ProductCard product={{ ...solar, coverUrl: "/images/solar-drift.webp" }} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/images/solar-drift.webp");
  });
});
