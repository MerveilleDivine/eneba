import { useState } from "react";
import { displayEuro, type CatalogProduct } from "./catalog-api";
import styles from "./ProductCard.module.css";
import { platformLabels, regionLabels } from "./catalog-labels";

// Catalog cards are standalone articles; linked homepage cards use a neutral div
// so assistive technology can derive the link name from visible card text.
type Props = { product: CatalogProduct; as?: "article" | "div" };

// Use stable product identity rather than list order to choose a cover gradient.
function coverVariation(id: string): number {
  let variation = 0;
  for (const character of id) {
    variation = (variation * 31 + character.charCodeAt(0)) % 4;
  }
  return variation;
}

export function ProductCard({ product, as: Root = "article" }: Props) {
  const [failedCoverUrl, setFailedCoverUrl] = useState<string>();
  return (
    <Root className={styles.productCard}>
      <div className={styles.cover} data-variation={coverVariation(product.id)}>
        {failedCoverUrl !== product.coverUrl && (
          <img
            src={product.coverUrl}
            alt=""
            width="432"
            height="576"
            loading="lazy"
            onError={() => setFailedCoverUrl(product.coverUrl)}
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
    </Root>
  );
}
