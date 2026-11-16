import styles from "./LoadingSkeleton.module.css";

type SkeletonKind = "orders" | "receipt" | "product" | "quote" | "account";

// Decorative placeholders preserve layout through a slow backend wake-up.
// The only announced content is the accessible loading label.
export function LoadingSkeleton({ kind, label }: { kind: SkeletonKind; label: string }) {
  return (
    <div className={`${styles.loading} ${styles[kind]}`} role="status">
      <span className={styles.screenReaderOnly}>{label}</span>
      <div className={styles.body} aria-hidden="true">
        {kind === "product" && <div className={styles.cover} />}
        <div className={styles.details}>
          <span className={`${styles.bar} ${styles.wide}`} />
          <span className={`${styles.bar} ${styles.medium}`} />
          <span className={`${styles.bar} ${styles.narrow}`} />
          {kind === "orders" && (
            <>
              <span className={styles.divider} />
              <span className={`${styles.bar} ${styles.medium}`} />
              <span className={`${styles.bar} ${styles.narrow}`} />
            </>
          )}
          {(kind === "receipt" || kind === "quote") && (
            <span className={styles.divider} />
          )}
          {kind !== "account" && (
            <span className={`${styles.bar} ${styles.medium}`} />
          )}
        </div>
      </div>
    </div>
  );
}
