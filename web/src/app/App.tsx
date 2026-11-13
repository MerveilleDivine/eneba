import { useEffect, useState } from "react";
import { checkReadiness } from "../shared/api/readiness";
import styles from "./App.module.css";

type ConnectionState = "loading" | "ready" | "unavailable";

const connectionMessages: Record<ConnectionState, string> = {
  loading: "Connecting to the marketplace…",
  ready: "Connection established",
  unavailable: "The service is temporarily unavailable.",
};

export function App() {
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    void checkReadiness(controller.signal)
      .then(() => {
        if (active) setConnection("ready");
      })
      .catch(() => {
        if (active) setConnection("unavailable");
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  function retryConnection() {
    setConnection("loading");
    setAttempt((current) => current + 1);
  }

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="Eneba demo home">
          <span className={styles.brandMark} aria-hidden="true">
            e
          </span>
          <span>
            eneba<span className={styles.brandDot}>.</span>
          </span>
        </a>
        <span className={styles.demoLabel}>Unofficial demo</span>
      </header>

      <main id="main" className={styles.main}>
        <section className={styles.introduction} aria-labelledby="page-title">
          <p className={styles.eyebrow}>A new adventure is loading</p>
          <h1 id="page-title">
            Your next world
            <br />
            <span>starts here.</span>
          </h1>
          <p className={styles.description}>
            A game marketplace, taking shape. This early preview lays the foundation for discovering
            games, comparing sellers, and collecting demo keys.
          </p>
          <div className={styles.notice}>
            <span className={styles.noticeIcon} aria-hidden="true">
              ✦
            </span>
            <p>Made for learning. Every purchase will be simulated and every key nonredeemable.</p>
          </div>
        </section>

        <section className={styles.connectionCard} aria-labelledby="connection-title">
          <div className={styles.orbit} aria-hidden="true">
            <span className={styles.orbitCore}>e</span>
            <span className={styles.orbitDot} />
          </div>
          <p className={styles.cardEyebrow}>The first checkpoint</p>
          <h2 id="connection-title">Ready for what’s next.</h2>
          <div
            className={styles.connectionStatus}
            role={connection === "unavailable" ? "alert" : "status"}
            aria-live="polite"
          >
            <span className={styles.statusDot} data-state={connection} aria-hidden="true" />
            <span>{connectionMessages[connection]}</span>
          </div>
          <p className={styles.cardDescription}>
            {connection === "unavailable"
              ? "Please try again in a moment."
              : "The catalog is coming in the next release."}
          </p>
          <button
            type="button"
            className={styles.checkButton}
            onClick={retryConnection}
            disabled={connection === "loading"}
          >
            {connection === "loading" ? "Checking connection…" : "Check connection"}
            <span aria-hidden="true">↗</span>
          </button>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>An independent engineering project.</span>
        <span>Fictional games. Demo keys. No real charges.</span>
      </footer>
    </div>
  );
}
