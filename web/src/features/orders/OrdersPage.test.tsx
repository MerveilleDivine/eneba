import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { announceSessionChange } from "../auth/session-events";
import { OrderDetailPage } from "./OrdersPage";

const id = "40000000-0000-4000-8000-000000000001";
const code = "DEMO-NOT-REDEEMABLE-OWNER-ONLY";
const order = {
  id,
  createdAt: "2026-11-16T12:00:00Z",
  currency: "EUR",
  totalCents: 1250,
  items: [
    {
      id,
      productName: "Solar Drift",
      sellerName: "Orbit Games",
      unitPriceCents: 1250,
      keyCode: code,
    },
  ],
};
function open() {
  return render(
    <MemoryRouter initialEntries={[`/orders/${id}`]}>
      <Routes>
        <Route path="/orders/:orderId" element={<OrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
afterEach(() => vi.unstubAllGlobals());

it("delivers a server receipt and reports real clipboard success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(order))));
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  open();
  expect(await screen.findByDisplayValue(code)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
  expect(await screen.findByText("Key copied to clipboard.")).toBeVisible();
  expect(writeText).toHaveBeenCalledWith(code);
});

it("selects the key instead of claiming success when copying is denied", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(order))));
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  open();
  const input = (await screen.findByDisplayValue(code)) as HTMLInputElement;
  fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
  await screen.findByText(/Copy wasn't available/);
  expect(input).toHaveFocus();
  expect(input.selectionEnd! - input.selectionStart!).toBe(code.length);
  expect(screen.queryByText("Key copied to clipboard.")).not.toBeInTheDocument();
});

it("removes delivered keys immediately on a session change", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(order)))
    .mockResolvedValue(new Response("", { status: 401 }));
  vi.stubGlobal("fetch", read);
  open();
  await screen.findByDisplayValue(code);
  act(() => announceSessionChange());
  expect(screen.queryByDisplayValue(code)).not.toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    `/sign-in?next=${encodeURIComponent("/orders/" + id)}`,
  );
});

it("discards a late key response after another tab changes the account", async () => {
  let resolve!: (response: Response) => void;
  const read = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue(new Response("", { status: 404 }));
  vi.stubGlobal("fetch", read);
  open();
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "eneba:session-change", newValue: "changed" }),
    ),
  );
  await screen.findByRole("heading", { name: "Order unavailable" });
  await act(async () => resolve(new Response(JSON.stringify(order))));
  expect(screen.queryByDisplayValue(code)).not.toBeInTheDocument();
});
