import { useState } from "react";
import { Link } from "react-router";
import { displayEuro } from "../../shared/format/money";
import { platformLabels, regionLabels } from "../../shared/product/identity";
import { productHref } from "../../shared/navigation/product-links";
import type { Deal } from "./deals-api";
import styles from "./Deals.module.css";

type Props = { deal: Deal };

export function DealCard({ deal }: Props) {
  const [failedCoverUrl, setFailedCoverUrl] = useState<string>();
  const destination = productHref(deal.slug, deal.offerId);
  return (
    <li className={styles.item}>
      <Link className={styles.offerLink} to={destination}>
        <div className={styles.card}>
          <div className={styles.cover}>
            {failedCoverUrl !== deal.coverUrl && (
              <img
                src={deal.coverUrl}
                alt=""
                width="432"
                height="576"
                loading="lazy"
                onError={() => setFailedCoverUrl(deal.coverUrl)}
              />
            )}
            {deal.discountPercent > 0 && (
              <span className={styles.discount}>−{deal.discountPercent}%</span>
            )}
          </div>
          <div className={styles.details}>
            <h3>{deal.name}</h3>
            <p className={styles.identity}>
              {deal.edition} · {platformLabels[deal.platform]} · {regionLabels[deal.region]}
            </p>
            <p className={styles.seller}>Offer by {deal.sellerName}</p>
            <div className={styles.prices}>
              <strong>{displayEuro(deal.priceCents)}</strong>
              <del>{displayEuro(deal.listPriceCents)}</del>
            </div>
            <span className={styles.destination}>View offer</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
