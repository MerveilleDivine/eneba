import { useEffect, useState } from "react";
import { HomeRequestError, type HomeFailure } from "./home-request";

export type HomeRequestState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "failed"; kind: HomeFailure };

// Each section independently owns its abort, timeout, retry and stale-response
// guard. Request functions are module-level references to avoid refetch loops.
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

    void request(controller.signal)
      .then((data) => {
        if (active && !timedOut) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active || timedOut) return;
        setState({
          status: "failed",
          kind: error instanceof HomeRequestError ? error.kind : "unexpected",
        });
      })
      .finally(() => window.clearTimeout(timeout));

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
