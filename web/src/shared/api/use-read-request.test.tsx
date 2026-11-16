import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  READ_ATTEMPT_TIMEOUT_MS,
  READ_RECOVERY_WINDOW_MS,
  READ_RETRY_DELAY_MS,
  useReadRequest,
} from "./use-read-request";

afterEach(() => vi.useRealTimers());

function profile(read: (signal: AbortSignal) => Promise<string>) {
  return {
    read,
    failure: (error: unknown) =>
      error instanceof Error && error.message === "invalid" ? "invalid" : "unavailable",
    timeout: "timeout",
  } as const;
}

it("keeps the skeleton until a transient failure silently recovers", async () => {
  vi.useFakeTimers();
  const read = vi
    .fn()
    .mockRejectedValueOnce(new Error("unavailable"))
    .mockResolvedValueOnce("ready");
  const { result } = renderHook(() => useReadRequest(profile(read)));
  expect(result.current.state.status).toBe("loading");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(READ_RETRY_DELAY_MS - 1);
  });
  expect(result.current.state.status).toBe("loading");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(result.current.state).toEqual({ status: "ready", data: "ready" });
  expect(read).toHaveBeenCalledTimes(2);
});

it("keeps loading beyond six seconds and ignores a late aborted response", async () => {
  vi.useFakeTimers();
  let finishOld!: (value: string) => void;
  const old = new Promise<string>((resolve) => {
    finishOld = resolve;
  });
  const read = vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce("fresh");
  const { result } = renderHook(() => useReadRequest(profile(read)));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6_000);
  });
  expect(result.current.state.status).toBe("loading");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(READ_ATTEMPT_TIMEOUT_MS + READ_RETRY_DELAY_MS - 6_000);
  });
  expect(result.current.state).toEqual({ status: "ready", data: "fresh" });
  await act(async () => finishOld("obsolete"));
  expect(result.current.state).toEqual({ status: "ready", data: "fresh" });
});

it("fails safely after a bounded recovery window without showing a false result", async () => {
  vi.useFakeTimers();
  const read = vi.fn(() => new Promise<string>(() => {}));
  const { result, unmount } = renderHook(() => useReadRequest(profile(read)));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(READ_RECOVERY_WINDOW_MS - 1);
  });
  expect(result.current.state.status).toBe("loading");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(result.current.state).toEqual({ status: "failed", kind: "timeout" });
  unmount();
});

it("does not retry invalid requests and cancels an unmounted read", async () => {
  vi.useFakeTimers();
  const bad = vi.fn().mockRejectedValue(new Error("invalid"));
  const { result, unmount } = renderHook(() => useReadRequest(profile(bad)));
  await act(async () => Promise.resolve());
  expect(result.current.state).toEqual({ status: "failed", kind: "invalid" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(READ_RECOVERY_WINDOW_MS);
  });
  expect(bad).toHaveBeenCalledTimes(1);
  unmount();

  let signal: AbortSignal | undefined;
  const pending = vi.fn((next: AbortSignal) => {
    signal = next;
    return new Promise<string>(() => {});
  });
  const mounted = renderHook(() => useReadRequest(profile(pending)));
  mounted.unmount();
  expect(signal?.aborted).toBe(true);
});
