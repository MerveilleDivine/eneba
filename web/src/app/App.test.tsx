import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "./App";

const products = [
  {
    id: "1",
    slug: "solar-drift",
    name: "Solar Drift",
    edition: "Standard",
    platform: "steam",
    region: "global",
    coverUrl: "/images/demo-cover.svg",
    available: true,
    lowestPriceCents: 1136,
  },
  {
    id: "2",
    slug: "lunar-legacy",
    name: "Lunar Legacy",
    edition: "Standard",
    platform: "xbox",
    region: "europe",
    coverUrl: "/images/demo-cover.svg",
    available: false,
    lowestPriceCents: null,
  },
];
const payload = { items: products, total: 2, page: 1, pageSize: 12, currency: "EUR" };

afterEach(() => vi.unstubAllGlobals());

function renderApp(path = "/catalog") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("catalog browsing application", () => {
  it("renders real catalog products including the sold-out state", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", mock);
    renderApp();
    expect(await screen.findByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lunar Legacy" })).toBeInTheDocument();
    expect(screen.getByText("€11.36")).toBeInTheDocument();
    expect(screen.getByText("Currently unavailable")).toBeInTheDocument();
    expect(screen.getByText("Unofficial demo")).toBeInTheDocument();
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/products?"),
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("recovers from a service outage using Retry", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response("sensitive response", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", mock);
    renderApp();
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.queryByText("sensitive response")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("offers a filter reset when the API rejects the selection", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response("private server detail", { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", mock);
    renderApp("/catalog?platform=steam");

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("heading", { name: "Those filters couldn't be applied" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("private server detail")).not.toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("link", { name: "Reset filters" }));
    expect(await screen.findByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1][0]).not.toContain("platform=steam");
  });

  it("does not describe unexpected server failures as temporary outages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private stack", { status: 500 })),
    );
    renderApp();
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("heading", { name: "We couldn't load the games" }),
    ).toBeInTheDocument();
    expect(alert).not.toHaveTextContent("temporarily unavailable");
    expect(screen.queryByText("private stack")).not.toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("explains network failures and allows retry without leaking details", async () => {
    const mock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("private network address"))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", mock);
    renderApp();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Connection problem" })).toBeInTheDocument();
    expect(alert).toHaveTextContent("Check your connection");
    expect(screen.queryByText("private network address")).not.toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("treats a malformed success response as an unexpected failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{private", { status: 200 })));
    renderApp();
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("heading", { name: "We couldn't load the games" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("{private")).not.toBeInTheDocument();
  });

  it("rejects malformed links without sending an HTTP request", () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    renderApp("/catalog?pageSize=100");
    expect(screen.getByRole("alert")).toHaveTextContent("page size is invalid");
    expect(mock).not.toHaveBeenCalled();
  });

  it("submits a header search to the actual API", async () => {
    const mock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", mock);
    renderApp();
    const search = screen.getByRole("searchbox", { name: "Search games" });
    await userEvent.type(search, "solar{enter}");
    expect(await screen.findByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(mock.mock.calls.some((call) => String(call[0]).includes("q=solar"))).toBe(true);
  });
  it("searches from another page through the shared header", async () => {
    const mock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", mock);
    renderApp("/not-a-page");
    expect(screen.getByRole("heading", { name: "That page doesn't exist." })).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Search games" });
    await userEvent.type(search, "solar{enter}");
    expect(await screen.findByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(mock.mock.calls.some((call) => String(call[0]).includes("q=solar"))).toBe(true);
  });
  it("keeps shared navigation functional on unknown routes", async () => {
    const mock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", mock);
    renderApp("/missing");
    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    const catalogLink = within(navigation).getByRole("link", { name: "Browse games" });
    expect(catalogLink).not.toHaveAttribute("aria-current");
    await userEvent.click(catalogLink);
    expect(await screen.findByRole("heading", { name: "Explore games" })).toBeInTheDocument();
    expect(catalogLink).toHaveAttribute("aria-current", "page");
  });
  it("ignores an obsolete response after navigation to a newer search", async () => {
    let finishFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => {
      finishFirst = resolve;
    });
    const second = { ...payload, items: [products[1]], total: 1 };
    let firstSignal: AbortSignal | undefined;
    const mock = vi.fn((url: string, init: RequestInit) => {
      if (url.includes("q=solar")) {
        firstSignal = init.signal as AbortSignal;
        return first;
      }
      return Promise.resolve(new Response(JSON.stringify(second)));
    });
    vi.stubGlobal("fetch", mock);
    renderApp("/catalog?q=solar");
    const search = screen.getByRole("searchbox", { name: "Search games" });
    await userEvent.clear(search);
    await userEvent.type(search, "lunra{enter}");
    expect(await screen.findByRole("heading", { name: "Lunar Legacy" })).toBeInTheDocument();
    expect(firstSignal?.aborted).toBe(true);
    finishFirst(new Response(JSON.stringify(payload)));
    await Promise.resolve();
    expect(screen.queryByRole("heading", { name: "Solar Drift" })).not.toBeInTheDocument();
  });
  it("aborts an obsolete catalog request when a filter changes", async () => {
    let resolveOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    let oldSignal: AbortSignal | undefined;
    const updated = { ...payload, items: [products[1]], total: 1 };
    const mock = vi.fn((url: string, options: RequestInit) => {
      if (!url.includes("platform=xbox")) {
        oldSignal = options.signal as AbortSignal;
        return oldResponse;
      }
      return Promise.resolve(new Response(JSON.stringify(updated)));
    });
    vi.stubGlobal("fetch", mock);
    renderApp();

    await userEvent.selectOptions(screen.getByLabelText("Platform"), "xbox");
    expect(await screen.findByRole("heading", { name: "Lunar Legacy" })).toBeInTheDocument();
    expect(oldSignal?.aborted).toBe(true);
    expect(mock).toHaveBeenCalledTimes(2);

    resolveOld(new Response(JSON.stringify(payload)));
    await Promise.resolve();
    expect(screen.queryByRole("heading", { name: "Solar Drift" })).not.toBeInTheDocument();
  });

  it("shows loading instead of previous results while a new filter is pending", async () => {
    let resolveNext!: (response: Response) => void;
    const nextResponse = new Promise<Response>((resolve) => {
      resolveNext = resolve;
    });
    const mock = vi.fn((url: string) =>
      url.includes("platform=xbox")
        ? nextResponse
        : Promise.resolve(new Response(JSON.stringify(payload))),
    );
    vi.stubGlobal("fetch", mock);
    renderApp();
    expect(await screen.findByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Platform"), "xbox");
    expect(screen.getByRole("status")).toHaveTextContent("Loading games");
    expect(screen.queryByRole("heading", { name: "Solar Drift" })).not.toBeInTheDocument();

    resolveNext(new Response(JSON.stringify({ ...payload, items: [products[1]], total: 1 })));
    expect(await screen.findByRole("heading", { name: "Lunar Legacy" })).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
