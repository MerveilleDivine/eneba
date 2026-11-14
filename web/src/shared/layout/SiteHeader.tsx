import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import styles from "./SiteHeader.module.css";

export function SiteHeader({ search }: { search: ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} to="/catalog" aria-label="Eneba demo catalog">
          <span className={styles.brandMark} aria-hidden="true">
            e
          </span>
          <span>
            eneba<span className={styles.brandDot}>.</span>
          </span>
        </Link>
        <div className={styles.searchSlot}>{search}</div>
        <nav aria-label="Main navigation" className={styles.navigation}>
          <NavLink to="/catalog" end>
            Browse games
          </NavLink>
        </nav>
      </div>
      <div className={styles.demoStrip}>
        <span>Unofficial demo</span>
        <span aria-hidden="true">·</span>
        <span>Digital games, simulated purchases</span>
      </div>
    </header>
  );
}
