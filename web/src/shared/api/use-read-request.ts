import { useEffect, useState } from "react";

type ReadState<T, K extends string> =
  { status: "loading" } | { status: "ready"; data: T } | { status: "failed"; kind: K };
type ReadProfile<T, K extends string> = {
  read: (signal: AbortSignal) => Promise<T>;
  failure: (error: unknown) => K;
  timeout: K;
};

// One mounted owner represents one immutable request identity. Key the owner
// when that identity changes (catalog query / product slug). Retry is the only
// refetch. Capturing the profile avoids inline callbacks restarting requests.
export function useReadRequest<T, K extends string>(profile: ReadProfile<T, K>) {
  const [request] = useState(() => profile);
  const [state, setState] = useState<ReadState<T, K>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      if (!active) return;
      timedOut = true;
      controller.abort();
      setState({ status: "failed", kind: request.timeout });
    }, 6000);
    void request
      .read(controller.signal)
      .then((data) => {
        if (active && !timedOut) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (active && !timedOut) setState({ status: "failed", kind: request.failure(error) });
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
