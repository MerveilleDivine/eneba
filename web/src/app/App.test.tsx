import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("marketplace connection", () => {
  it("shows a successful connection using the same-origin readiness endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ready" })));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    expect(await screen.findByText("Connection established")).toBeInTheDocument();
    expect(screen.getByText("Unofficial demo")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/readyz",
      expect.objectContaining({ cache: "no-store", credentials: "same-origin" }),
    );
  });

  it("preserves a useful error state and retries without displaying server details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("password=private", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ready" })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.queryByText(/password=private/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check connection" }));
    expect(await screen.findByText("Connection established")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
  });

  it("rejects an unexpected successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "unknown" }))),
    );
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
  });
});
