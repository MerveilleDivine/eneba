export async function checkReadiness(signal: AbortSignal): Promise<void> {
  const response = await fetch("/readyz", {
    signal,
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Service is unavailable.");
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("status" in body) || body.status !== "ready") {
    throw new Error("Unexpected service response.");
  }
}
