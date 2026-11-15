import { useEffect, useState } from "react";
import { HomeRequestError, type HomeFailure } from "./home-request";

export type HomeRequestState<T> =
  { status: "loading" } | { status: "ready"; data: T } | { status: "failed"; kind: HomeFailure };

function failureKind(error: unknown): HomeFailure {
  return error instanceof HomeRequestError ? error.kind : "unexpected";
}

// Each section owns its own timeout, abort, stale-response guard and retry.
export function useHomeRequest<T>(request: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<HomeRequestState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      if (!active) return;
      timedOut = true;
      controller.abort();
      setState({ status: "failed", kind: "timeout" });
    }, 6000);

    async function load() {
      try {
        const data = await request(controller.signal);
        if (active && !timedOut) setState({ status: "ready", data });
      } catch (error) {
        if (active && !timedOut) {
          setState({ status: "failed", kind: failureKind(error) });
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [attempt, request]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }

  return { state, retry };
}
