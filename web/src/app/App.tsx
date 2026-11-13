import { Link, Navigate, Route, Routes } from "react-router";
import { SiteHeader } from "../shared/layout/SiteHeader";
import { CatalogPage } from "../features/catalog/CatalogPage";
import styles from "./App.module.css";

function NotFound() {
  return (
    <section className={styles.notFound}>
      <p className={styles.eyebrow}>Page not found</p>
      <h1>That page doesn't exist.</h1>
      <p>Explore the games available in our catalog instead.</p>
      <Link to="/catalog" className={styles.backLink}>Browse games</Link>
    </section>
  );
}

export function App() {
  return (
    <div className={styles.app}>
      <a href="#main" className={styles.skipLink}>Skip to content</a>
      <SiteHeader />
      <main id="main" className={styles.main}>
        <Routes>
          <Route path="/" element={<Navigate to="/catalog" replace />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className={styles.footer}>
        <span>Independent marketplace demonstration.</span>
        <span>Fictional games · Nonredeemable keys · No real payments</span>
      </footer>
    </div>
  );
}
