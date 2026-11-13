import { useState } from "react";
import { displayEuro, type CatalogProduct } from "./catalog-api";
import styles from "./CatalogPage.module.css";
import { platformLabels, regionLabels } from "./catalog-labels";

type Props = { product: CatalogProduct; position: number };

export function ProductCard({ product, position }: Props) {
  const [coverUnavailable, setCoverUnavailable] = useState(false);
  return (
    <article className={styles.productCard}>
      <div className={styles.cover} data-variation={position % 4}>
        {!coverUnavailable && (
          <img
            src={product.coverUrl}
            alt=""
            loading="lazy"
            onError={() => setCoverUnavailable(true)}
          />
        )}
        <div className={styles.coverText} aria-hidden="true">
          <span className={styles.coverEdition}>{product.edition} edition</span>
          <span className={styles.coverTitle}>{product.name}</span>
        </div>
        {!product.available && <span className={styles.soldOutBadge}>Sold out</span>}
      </div>
      <div className={styles.productInfo}>
        <h3>{product.name}</h3>
        <p className={styles.productEdition}>{product.edition} edition</p>
        <div className={styles.productBadges}>
          <span>{platformLabels[product.platform]}</span>
          <span>{regionLabels[product.region]}</span>
        </div>
        {product.available && product.lowestPriceCents !== null ? (
          <div className={styles.productPrice}>
            <span>From</span>
            <strong>{displayEuro(product.lowestPriceCents)}</strong>
          </div>
        ) : (
          <p className={styles.soldOutPrice}>Currently unavailable</p>
        )}
      </div>
    </article>
  );
}
