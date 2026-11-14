import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter } from "react-router";
import { App } from "../../app/App";

const steam = {
  id: "game-steam",
  slug: "solar-drift",
  name: "Solar Drift",
  edition: "Standard",
  platform: "steam",
  region: "global",
  coverUrl: "/images/demo-cover.svg",
  lowestPriceCents: 1499,
  available: true,
};
const xbox = {
  ...steam,
  id: "game-xbox",
  slug: "the-last-outpost",
  name: "The Last Outpost",
  platform: "xbox",
  region: "europe",
};

function responseFor(product: typeof steam): Response {
  return new Response(
    JSON.stringify({ items: [product], total: 1, page: 1, pageSize: 12, currency: "EUR" }),
  );
}

function renderCatalog(path = "/catalog?platform=steam") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("catalog request lifecycle under competing results", () => {
  it("keeps an in-flight request when navigating between equivalent catalog URLs", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return pending;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/catalog?sort=name_asc"]}>
        <Link to="/catalog">Canonical catalog</Link>
        <App />
      </MemoryRouter>,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("link", { name: "Canonical catalog" }));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("Loading games");

    await act(async () => {
      finish(responseFor(steam));
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves a settled result across equivalent URL navigation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseFor(steam));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MemoryRouter initialEntries={["/catalog?sort=name_asc"]}>
        <Link to="/catalog">Canonical catalog</Link>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Canonical catalog" }));
    expect(screen.getByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("handles Strict Mode effect replay without showing an obsolete result", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      if (signals.length === 1) return new Promise<Response>(() => {});
      return Promise.resolve(responseFor(steam));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/catalog?platform=steam"]}>
          <App />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps a retry pending when its timed-out predecessor succeeds late", async () => {
    vi.useFakeTimers();
    let finishOld!: (response: Response) => void;
    let finishRetry!: (response: Response) => void;
    const previous = new Promise<Response>((resolve) => {
      finishOld = resolve;
    });
    const retry = new Promise<Response>((resolve) => {
      finishRetry = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(previous).mockReturnValueOnce(retry);
    vi.stubGlobal("fetch", fetchMock);
    renderCatalog();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("took too long");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading games");

    await act(async () => {
      finishOld(responseFor(xbox));
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Loading games");
    expect(screen.queryByRole("heading", { name: "The Last Outpost" })).not.toBeInTheDocument();

    await act(async () => {
      finishRetry(responseFor(steam));
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a rejected old request after a newer filter result succeeds", async () => {
    let rejectOld!: (reason: Error) => void;
    let oldSignal: AbortSignal | undefined;
    const oldRequest = new Promise<Response>((_resolve, reject) => {
      rejectOld = reject;
    });
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      if (url.includes("platform=steam")) {
        oldSignal = init.signal as AbortSignal;
        return oldRequest;
      }
      return Promise.resolve(responseFor(xbox));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderCatalog();

    await userEvent.selectOptions(screen.getByLabelText("Platform"), "xbox");
    expect(await screen.findByRole("heading", { name: "The Last Outpost" })).toBeInTheDocument();
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      rejectOld(new TypeError("sensitive old request failure"));
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "The Last Outpost" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the newest result after a rapid A to B to A navigation", async () => {
    const requests: {
      signal: AbortSignal;
      complete: (response: Response) => void;
    }[] = [];
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      return new Promise<Response>((resolve) => {
        requests.push({ signal: init.signal as AbortSignal, complete: resolve });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderCatalog();

    await userEvent.selectOptions(screen.getByLabelText("Platform"), "xbox");
    await userEvent.selectOptions(screen.getByLabelText("Platform"), "steam");
    expect(requests).toHaveLength(3);
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests[1].signal.aborted).toBe(true);

    await act(async () => {
      requests[2].complete(responseFor(steam));
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();

    await act(async () => {
      requests[1].complete(responseFor(xbox));
      requests[0].complete(new Response("private error", { status: 503 }));
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "The Last Outpost" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ignores a timed-out request after retry starts", async () => {
    vi.useFakeTimers();
    let rejectOld!: (reason: Error) => void;
    let resolveRetry!: (response: Response) => void;
    const oldRequest = new Promise<Response>((_resolve, reject) => {
      rejectOld = reject;
    });
    const retryRequest = new Promise<Response>((resolve) => {
      resolveRetry = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => oldRequest)
      .mockImplementationOnce(() => retryRequest);
    vi.stubGlobal("fetch", fetchMock);
    renderCatalog();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("took too long");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading games");
    await act(async () => {
      rejectOld(new TypeError("private stale connection"));
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Loading games");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () => {
      resolveRetry(responseFor(steam));
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the timeout visible if JSON body reading completes after the deadline", async () => {
    vi.useFakeTimers();
    let finishBody!: (value: unknown) => void;
    const body = new Promise<unknown>((resolve) => {
      finishBody = resolve;
    });
    const response = responseFor(steam);
    const parse = vi.spyOn(response, "json").mockImplementation(() => body);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    renderCatalog();

    await act(async () => {
      await Promise.resolve();
    });
    expect(parse).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("took too long");

    await act(async () => {
      finishBody({ items: [steam], total: 1, page: 1, pageSize: 12, currency: "EUR" });
      await Promise.resolve();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("took too long");
    expect(screen.queryByRole("heading", { name: "Solar Drift" })).not.toBeInTheDocument();
  });

  it("does not raise a timeout after a response already succeeded", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFor(steam)));
    renderCatalog();

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Solar Drift" })).toBeInTheDocument();
  });

  it("aborts requests on route departure without showing old failures", async () => {
    let rejectRequest!: (reason: Error) => void;
    let signal: AbortSignal | undefined;
    const pending = new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal as AbortSignal;
        return pending;
      }),
    );
    render(
      <MemoryRouter initialEntries={["/catalog?platform=steam"]}>
        <Link to="/missing">Leave catalog</Link>
        <App />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole("link", { name: "Leave catalog" }));
    expect(screen.getByRole("heading", { name: "That page doesn't exist." })).toBeInTheDocument();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      rejectRequest(new TypeError("private canceled request"));
      await Promise.resolve();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "That page doesn't exist." })).toBeInTheDocument();
  });
});
