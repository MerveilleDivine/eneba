import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CatalogFilters } from "./CatalogFilters";
import { defaultCatalogQuery, type CatalogQuery } from "./catalog-query";

describe("catalog price-filter drafts", () => {
  const baseQuery = defaultCatalogQuery();

  function renderFilters(query: CatalogQuery = baseQuery) {
    const onChange = vi.fn();
    const onClear = vi.fn();
    const view = render(<CatalogFilters query={query} onChange={onChange} onClear={onClear} />);
    return { ...view, onChange, onClear };
  }

  it("preserves an unsubmitted draft and input identity across unrelated filter changes", async () => {
    const query: CatalogQuery = { ...baseQuery, platform: "steam" };
    const { rerender, onChange, onClear } = renderFilters(query);
    const minimum = screen.getByRole("textbox", { name: "Min" });
    await userEvent.type(minimum, "11.36");

    rerender(
      <CatalogFilters
        query={{ ...query, region: "global" }}
        onChange={onChange}
        onClear={onClear}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Min" })).toBe(minimum);
    expect(minimum).toHaveValue("11.36");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("restores URL prices without remounting when applied prices change", () => {
    const { rerender, onChange, onClear } = renderFilters();
    const minimum = screen.getByRole("textbox", { name: "Min" });
    const maximum = screen.getByRole("textbox", { name: "Max" });

    rerender(
      <CatalogFilters
        query={{ ...baseQuery, minPriceCents: 1136, maxPriceCents: 2500 }}
        onChange={onChange}
        onClear={onClear}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Min" })).toBe(minimum);
    expect(minimum).toHaveValue("11.36");
    expect(maximum).toHaveValue("25.00");

    rerender(<CatalogFilters query={baseQuery} onChange={onChange} onClear={onClear} />);
    expect(minimum).toHaveValue("");
    expect(maximum).toHaveValue("");
  });

  it("clears an unsubmitted draft even when the URL has no applied price range", async () => {
    const { onClear } = renderFilters({ ...baseQuery, platform: "steam" });
    const minimum = screen.getByRole("textbox", { name: "Min" });
    const maximum = screen.getByRole("textbox", { name: "Max" });
    await userEvent.type(minimum, "20");
    await userEvent.type(maximum, "10");
    await userEvent.click(screen.getByRole("button", { name: "Apply price" }));
    expect(screen.getByRole("alert")).toHaveTextContent("minimum no higher");

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(minimum).toHaveValue("");
    expect(maximum).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears validation on editing and skips no-op price submissions", async () => {
    const query: CatalogQuery = { ...baseQuery, minPriceCents: 1136 };
    const { onChange } = renderFilters(query);
    const minimum = screen.getByRole("textbox", { name: "Min" });
    const maximum = screen.getByRole("textbox", { name: "Max" });

    await userEvent.click(screen.getByRole("button", { name: "Apply price" }));
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.type(maximum, "10");
    await userEvent.click(screen.getByRole("button", { name: "Apply price" }));
    expect(screen.getByRole("alert")).toHaveTextContent("minimum no higher");

    await userEvent.clear(maximum);
    await userEvent.type(maximum, "30");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Apply price" }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({
      ...query,
      maxPriceCents: 3000,
      page: 1,
    });
    expect(minimum).toHaveValue("11.36");
  });
});
