import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { platforms, platformLabels } from "../product/identity";
import styles from "./SiteHeader.module.css";

export function SiteHeader({ search, cartCount = 0 }: { search: ReactNode; cartCount?: number }) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  return (
    <header ref={header} className={styles.header}>
      <div className={styles.inner}>
        <button
          ref={menuButton}
          className={styles.menuButton}
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="marketplace-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <Link
          className={styles.brand}
          to="/"
          aria-label="eneba / play home"
          onClick={() => setOpen(false)}
        >
          <span>
            eneba<span className={styles.brandDot}> / play</span>
          </span>
        </Link>
        <div className={styles.searchSlot}>{search}</div>
        <div className={styles.accountActions}>
          <span className={styles.currency}>EUR €</span>
          <NavLink to="/account" aria-label="Account">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="7" r="4" />
              <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
            </svg>
            <span className={styles.actionLabel}>Account</span>
          </NavLink>
          <NavLink to="/cart" aria-label={`Cart ${cartCount}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 3h3l3 12h11l3-9H6M9 20h.01M18 20h.01" />
            </svg>
            <span className={styles.actionLabel}>Cart</span>{" "}
            <span className={styles.cartCount}>{cartCount}</span>
          </NavLink>
        </div>
      </div>
      <div className={styles.navBar}>
        <nav
          id="marketplace-navigation"
          aria-label="Main navigation"
          className={`${styles.navigation} ${open ? styles.open : ""}`}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a")) {
              setOpen(false);
              if (open) document.getElementById("main")?.focus();
            }
          }}
        >
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/catalog" end>
            Browse games
          </NavLink>
          {platforms.map((platform) => (
            <Link key={platform} to={`/catalog?platform=${platform}`}>
              {platformLabels[platform]}
            </Link>
          ))}
          <NavLink to="/orders">Orders & keys</NavLink>
        </nav>
      </div>
    </header>
  );
}
