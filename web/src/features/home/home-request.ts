export type HomeFailure = "unavailable" | "network" | "timeout" | "unexpected";

export class HomeRequestError extends Error {
  constructor(public readonly kind: HomeFailure) {
    super(kind);
    this.name = "HomeRequestError";
  }
}

export async function requestHomeData<T>(
  path: string,
  signal: AbortSignal,
  parse: (body: unknown) => T,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new HomeRequestError(error instanceof TypeError ? "network" : "unexpected");
  }
  if (!response.ok) {
    throw new HomeRequestError(
      response.status === 408 || response.status === 504
        ? "timeout"
        : [502, 503].includes(response.status)
          ? "unavailable"
          : "unexpected",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new HomeRequestError(error instanceof TypeError ? "network" : "unexpected");
  }
  return parse(body);
}
