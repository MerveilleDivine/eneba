import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthRequestError, currentAccount, parseAccount, registerAccount, signIn, signOut } from "./auth-api";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.com",
  displayName: "Demo Buyer",
};
afterEach(() => vi.unstubAllGlobals());

describe("authentication transport", () => {
  it("validates public account identity and rejects secret-bearing projections", () => {
    expect(parseAccount({ user })).toEqual(user);
    expect(() => parseAccount({ user: { ...user, id: "invalid" } })).toThrow(AuthRequestError);
    expect(() => parseAccount({ user: { ...user, displayName: "" } })).toThrow(AuthRequestError);
    expect(() => parseAccount({ user: { ...user, displayName: "\uFEFF" } })).toThrow(AuthRequestError);
    expect(() => parseAccount({ user: { ...user, displayName: "Buyer\u202e" } })).toThrow(AuthRequestError);
    expect(() => parseAccount({ user: { ...user, displayName: "\u200b" } })).toThrow(AuthRequestError);
  });
  it("treats an anonymous session as a guest without exposing server response details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private diagnostic", { status: 401 })));
    await expect(currentAccount(new AbortController().signal)).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });
  it("uses credentialed POSTs and parses a returned account", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    await expect(signIn(user.email, "a secure password 123")).resolves.toEqual(user);
    expect(mock).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ email: user.email, password: "a secure password 123" }),
      }),
    );
    await expect(registerAccount(user.displayName, user.email, "a secure password 123")).resolves.toEqual(user);
    expect(mock).toHaveBeenCalledWith(
      "/api/v1/auth/register",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
  it("never returns a successful account on a server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("internal", { status: 503 })));
    await expect(signIn(user.email, "a secure password 123")).rejects.toMatchObject({ kind: "unavailable" });
  });
  it("sends a credentialed logout without client-side cookie handling", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", mock);
    await signOut();
    expect(mock).toHaveBeenCalledWith(
      "/api/v1/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
  });
});

describe("bounded authentication requests", () => {
  it("reports a timeout even when a mocked fetch ignores cancellation", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
      (options.signal as AbortSignal).addEventListener("abort", () => { cancelled = true; });
      return new Promise<Response>(() => {});
    }));
    try {
      const action = signIn("demo@example.com", "some valid password 123");
      const result = expect(action).rejects.toMatchObject({ kind: "unavailable" });
      await vi.advanceTimersByTimeAsync(10000);
      await result;
      expect(cancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
