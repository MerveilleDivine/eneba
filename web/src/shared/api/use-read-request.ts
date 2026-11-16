import { useEffect, useState } from "react";

type ReadState<T, K extends string> =
  { status: "loading" } | { status: "ready"; data: T } | { status: "failed"; kind: K };
type ReadProfile<T, K extends string> = {
  read: (signal: AbortSignal) => Promise<T>;
  failure: (error: unknown) => K;
  timeout: K;
};

// Read-only requests may span a free-host cold start. Keep the existing
// skeleton mounted while transient failures recover; never retry mutations.
export const READ_RECOVERY_WINDOW_MS = 90_000;
export const READ_ATTEMPT_TIMEOUT_MS = 25_000;
export const READ_RETRY_DELAY_MS = 1_200;
const RETRYABLE = new Set<string>(["network", "unavailable", "timeout"]);

// Each keyed owner represents one immutable read (catalog query, product,
// order or quote). A new key or Retry aborts its old work, including timers.
export function useReadRequest<T, K extends string>(profile: ReadProfile<T, K>) {
  const [request] = useState(() => profile);
  const [state, setState] = useState<ReadState<T, K>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let requestTimer: number | undefined;
    let retryTimer: number | undefined;
    const started = Date.now();

    async function load(): Promise<void> {
      if (!active) return;
      const remaining = READ_RECOVERY_WINDOW_MS - (Date.now() - started);
      if (remaining <= 0) {
        setState({ status: "failed", kind: request.timeout });
        return;
      }

      const current = new AbortController();
      controller = current;
      let timedOut = false;
      // Promise.race also settles when a mocked or broken transport ignores abort.
      const deadline = new Promise<never>((_resolve, reject) => {
        requestTimer = window.setTimeout(
          () => {
            timedOut = true;
            current.abort();
            reject(new Error("Read deadline exceeded"));
          },
          Math.min(READ_ATTEMPT_TIMEOUT_MS, remaining),
        );
      });

      try {
        const data = await Promise.race([request.read(current.signal), deadline]);
        if (active && controller === current) setState({ status: "ready", data });
      } catch (error) {
        if (!active || controller !== current) return;
        const kind = timedOut ? request.timeout : request.failure(error);
        const left = READ_RECOVERY_WINDOW_MS - (Date.now() - started);
        if (RETRYABLE.has(kind) && left > 0) {
          retryTimer = window.setTimeout(() => void load(), Math.min(READ_RETRY_DELAY_MS, left));
        } else {
          setState({ status: "failed", kind });
        }
      } finally {
        if (requestTimer !== undefined) window.clearTimeout(requestTimer);
        if (controller === current) controller = null;
      }
    }

    void load();
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (requestTimer !== undefined) window.clearTimeout(requestTimer);
      controller?.abort();
    };
  }, [attempt, request]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }

  return { state, retry };
}
