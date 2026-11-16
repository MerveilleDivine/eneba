import { Link, Route, Routes } from "react-router";
import { SiteHeader } from "../shared/layout/SiteHeader";
import { CatalogPage } from "../features/catalog/CatalogPage";
import { CatalogSearch } from "../features/catalog/CatalogSearch";
import { HomePage } from "../features/home/HomePage";
import { ProductPage } from "../features/product/ProductPage";
import {
  AccountPage,
  RegisterPage,
  SignInPage,
} from "../features/auth/AuthPages";
import { CartPage } from "../features/cart/CartPage";
import {
  CheckoutPage,
  CheckoutConfirmationPage,
} from "../features/checkout/CheckoutPage";
import { useCart } from "../features/cart/cart-store";
import styles from "./App.module.css";

function NotFound() {
  return (
    <section className={styles.notFound}>
      <p className={styles.eyebrow}>Page not found</p>
      <h1>That page doesn't exist.</h1>
      <p>Explore the games available in our catalog instead.</p>
      <Link to="/catalog" className={styles.backLink}>
        Browse games
      </Link>
    </section>
  );
}

export function App() {
  const cart = useCart();
  return (
    <div className={styles.app}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>
      <SiteHeader search={<CatalogSearch />} cartCount={cart.length} />
      <main id="main" tabIndex={-1} className={styles.main}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/products/:slug" element={<ProductPage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route
            path="/checkout/confirmation"
            element={<CheckoutConfirmationPage />}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className={styles.footer}>
        <span>Discover your next game</span>
      </footer>
    </div>
  );
}
