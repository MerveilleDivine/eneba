export type Account = { id: string; email: string; displayName: string };
export type AuthFailure = "invalid" | "taken" | "limited" | "unavailable" | "network" | "unexpected";

export class AuthRequestError extends Error {
  constructor(public readonly kind: AuthFailure) {
    super(kind);
    this.name = "AuthRequestError";
  }
}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
export function parseAccount(value: unknown): Account {
  if (!record(value) || !record(value.user)) throw new AuthRequestError("unexpected");
  const { id, email, displayName } = value.user;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    typeof email !== "string" || email.length < 5 || email.length > 254 || !email.includes("@") ||
    typeof displayName !== "string" || displayName.trim().length === 0 || Array.from(displayName).length > 80) {
    throw new AuthRequestError("unexpected");
  }
  return { id, email, displayName };
}
function failure(status: number): AuthFailure {
  if (status === 400 || status === 401) return "invalid";
  if (status === 409) return "taken";
  if (status === 429) return "limited";
  if ([502, 503, 504].includes(status)) return "unavailable";
  return "unexpected";
}
async function readAccount(response: Response): Promise<Account> {
  let body: unknown;
  try { body = await response.json(); } catch { throw new AuthRequestError("unexpected"); }
  return parseAccount(body);
}
export async function currentAccount(signal: AbortSignal): Promise<Account | null> {
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/me", {
      method: "GET", credentials: "same-origin", cache: "no-store", signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new AuthRequestError("network");
  }
  if (response.status === 401) return null;
  if (!response.ok) throw new AuthRequestError(failure(response.status));
  return readAccount(response);
}
async function postAccount(path: "register" | "login", body: unknown): Promise<Account> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/" + path, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthRequestError(controller.signal.aborted ? "unavailable" : "network");
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) throw new AuthRequestError(failure(response.status));
  return readAccount(response);
}
export function registerAccount(displayName: string, email: string, password: string) {
  return postAccount("register", { displayName, email, password });
}
export function signIn(email: string, password: string) {
  return postAccount("login", { email, password });
}
export async function signOut(): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/logout", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch { throw new AuthRequestError("network"); }
  if (!response.ok) throw new AuthRequestError(failure(response.status));
}
