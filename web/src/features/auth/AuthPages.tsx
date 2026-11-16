import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useReadRequest } from "../../shared/api/use-read-request";
import {
  AuthRequestError,
  currentAccount,
  registerAccount,
  signIn,
  signOut,
  type AuthFailure,
} from "./auth-api";
import styles from "./AuthPages.module.css";

const errors: Record<AuthFailure, string> = {
  invalid: "Check your account details and try again.",
  taken: "That email already has an account. Try signing in.",
  limited: "Too many requests. Please try again shortly.",
  unavailable:
    "The account service is temporarily unavailable. Please try again.",
  network: "We couldn't reach the server. Check your connection and try again.",
  unexpected: "Something went wrong. Please try again.",
};
function message(error: unknown): string {
  return error instanceof AuthRequestError
    ? errors[error.kind]
    : errors.unexpected;
}
function AuthForm({ mode }: { mode: "register" | "login" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo =
    new URLSearchParams(location.search).get("next") === "/checkout"
      ? "/checkout"
      : "/account";
  const nextQuery = returnTo === "/checkout" ? "?next=%2Fcheckout" : "";
  const mounted = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [mode]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isRegister = mode === "register";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (isRegister) await registerAccount(displayName, email, password);
      else await signIn(email, password);
      if (mounted.current) navigate(returnTo, { replace: true });
    } catch (reason) {
      if (mounted.current) setError(message(reason));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className={styles.shell}>
      <div className={styles.panel}>
        <p className={styles.kicker}>Your account</p>
        <h1 ref={heading} tabIndex={-1}>
          {isRegister ? "Create your account" : "Welcome back"}
        </h1>
        <form onSubmit={(event) => void submit(event)} className={styles.form}>
          {isRegister && (
            <label className={styles.field}>
              Display name
              <input
                autoComplete="name"
                required
                maxLength={80}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
          )}
          <label className={styles.field}>
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            Password
            <input
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={12}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {isRegister && (
            <p className={styles.hint}>
              Use a unique password of at least 12 characters.
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button type="submit" className={styles.submit} disabled={busy}>
            {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className={styles.alternate}>
          {isRegister ? "Already have an account?" : "New here?"}{" "}
          <Link to={(isRegister ? "/sign-in" : "/register") + nextQuery}>
            {isRegister ? "Sign in" : "Create an account"}
          </Link>
        </p>
        <Link
          className={styles.back}
          to={returnTo === "/checkout" ? "/checkout" : "/catalog"}
        >
          {returnTo === "/checkout" ? "Back to checkout" : "Back to games"}
        </Link>
      </div>
    </section>
  );
}
export function RegisterPage() {
  return <AuthForm mode="register" />;
}
export function SignInPage() {
  return <AuthForm mode="login" />;
}

export function AccountPage() {
  const navigate = useNavigate();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const { state, retry } = useReadRequest({
    read: currentAccount,
    failure: (error) =>
      error instanceof AuthRequestError ? error.kind : "unexpected",
    timeout: "unavailable" as AuthFailure,
  });
  async function logout() {
    if (busy) return;
    setBusy(true);
    setSignOutError("");
    try {
      await signOut();
      if (mounted.current) navigate("/sign-in", { replace: true });
    } catch (reason) {
      if (mounted.current) setSignOutError(message(reason));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className={styles.shell}>
      <div className={styles.panel}>
        <p className={styles.kicker}>Your account</p>
        <h1 ref={heading} tabIndex={-1}>
          Buyer account
        </h1>
        {state.status === "loading" && (
          <p role="status">Checking your session…</p>
        )}
        {state.status === "failed" && (
          <div role="alert">
            <p>{errors[state.kind]}</p>
            <button
              type="button"
              onClick={() => {
                heading.current?.focus();
                retry();
              }}
            >
              Try again
            </button>
          </div>
        )}
        {state.status === "ready" && state.data === null && (
          <>
            <p>Sign in to view your buyer account.</p>
            <Link to="/sign-in" className={styles.submit}>
              Sign in
            </Link>
            <p className={styles.alternate}>
              <Link to="/register">Create an account</Link>
            </p>
          </>
        )}
        {state.status === "ready" && state.data !== null && (
          <>
            <dl className={styles.facts}>
              <div>
                <dt>Name</dt>
                <dd>{state.data.displayName}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{state.data.email}</dd>
              </div>
            </dl>
            {signOutError && (
              <p className={styles.error} role="alert">
                {signOutError}
              </p>
            )}
            <button
              className={styles.submit}
              type="button"
              disabled={busy}
              onClick={() => void logout()}
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </>
        )}
        <Link className={styles.back} to="/catalog">
          Continue browsing
        </Link>
      </div>
    </section>
  );
}
