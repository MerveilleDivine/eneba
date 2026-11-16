import { Link } from "react-router";
import { platforms, platformLabels } from "../../shared/product/identity";
import { fetchBanners, type BannerFailure } from "./banner-api";
import { BestSellers } from "./BestSellers";
import { Deals } from "./Deals";
import { useHomeRequest } from "./use-home-request";
import { useHomeRetryFocus } from "./use-home-retry-focus";
import styles from "./HomePage.module.css";

const messages: Record<BannerFailure, { title: string; description: string }> = {
  unavailable: {
    title: "Featured games are temporarily unavailable",
    description: "Featured games are unavailable right now. You can still browse the catalog.",
  },
  network: {
    title: "Connection problem",
    description: "We couldn't load featured games. Check your connection and try again.",
  },
  timeout: {
    title: "Featured games took too long to load",
    description: "This section didn't load in time. Please try again.",
  },
  unexpected: {
    title: "We couldn't load featured games",
    description: "Something went wrong loading this section. Please try again.",
  },
};

function FeaturedBanners() {
  const { state, retry } = useHomeRequest(fetchBanners);
  const {
    sectionRef: loadingRef,
    headingRef,
    retrySection: retryBanners,
  } = useHomeRetryFocus(state.status, retry);

  if (state.status === "loading") {
    return (
      <section
        ref={loadingRef}
        tabIndex={-1}
        aria-label="Featured games"
        aria-busy="true"
        className={styles.loading}
      >
        <div className={styles.loadingCopy}>
          <span className={styles.loadingLine} />
          <span className={styles.loadingLine} />
          <span className={styles.loadingLine} />
          <p role="status">Loading featured games…</p>
        </div>
      </section>
    );
  }

  if (state.status === "failed") {
    const message = messages[state.kind];
    return (
      <section className={styles.fallback} aria-label="Featured games">
        <div role="alert">
          <p className={styles.eyebrow}>Featured games</p>
          <h1 ref={headingRef} tabIndex={-1}>
            {message.title}
          </h1>
          <p>{message.description}</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.retry} onClick={retryBanners}>
            Try again
          </button>
          <Link className={styles.secondaryLink} to="/catalog">
            Browse games
          </Link>
        </div>
      </section>
    );
  }

  if (state.data.length === 0) {
    return (
      <section className={styles.fallback} aria-label="Featured games">
        <p className={styles.eyebrow}>Featured games</p>
        <h1 ref={headingRef} tabIndex={-1}>
          Explore a world of games
        </h1>
        <p>Nothing is featured right now. Explore all games instead.</p>
        <Link className={styles.primaryLink} to="/catalog">
          Browse games
        </Link>
      </section>
    );
  }

  return (
    <section aria-label="Featured games" className={styles.banners}>
      {state.data.map((banner, index) => (
        <article
          key={banner.id}
          className={
            styles.banner + " " + (index === 0 ? styles.primaryBanner : styles.secondaryBanner)
          }
        >
          <img
            className={styles.bannerImage}
            src={banner.imageUrl}
            alt=""
            width="1600"
            height="900"
            decoding="async"
            loading={index === 0 ? "eager" : "lazy"}
          />
          <div className={styles.overlay} aria-hidden="true" />
          <div className={styles.bannerContent}>
            <p className={styles.eyebrow}>Discover something new</p>
            {index === 0 ? (
              <h1 ref={headingRef} tabIndex={-1}>
                {banner.headline}
              </h1>
            ) : (
              <h2>{banner.headline}</h2>
            )}
            {banner.subheading && <p className={styles.subtitle}>{banner.subheading}</p>}
            <Link className={styles.primaryLink} to={banner.linkHref}>
              Explore games <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
}

export function HomePage() {
  return (
    <div className={styles.home}>
      <div className={styles.heroLayout}>
        <FeaturedBanners />
        <aside className={styles.collections} aria-label="Explore collections">
          <Link to="/catalog?platform=steam" className={styles.collection}>
            <img src="/images/covers/solar-drift.webp" alt="" width="432" height="576" />
            <div>
              <span>Made for your PC</span>
              <h2>Find your next adventure</h2>
              <strong>Explore Steam →</strong>
            </div>
          </Link>
          <Link to="/catalog?platform=playstation" className={styles.collection}>
            <img src="/images/covers/deep-signal.webp" alt="" width="432" height="576" />
            <div>
              <span>Pick up the controller</span>
              <h2>Great worlds await</h2>
              <strong>Explore PlayStation →</strong>
            </div>
          </Link>
        </aside>
      </div>
      <nav className={styles.categories} aria-label="Shop by platform">
        <Link to="/catalog">
          <span aria-hidden="true">＋</span>All games
        </Link>
        {platforms
          .filter((platform) => platform !== "other")
          .map((platform) => (
            <Link key={platform} to={`/catalog?platform=${platform}`}>
              <span aria-hidden="true">
                {platform === "steam"
                  ? "PC"
                  : platform === "playstation"
                    ? "PS"
                    : platform === "xbox"
                      ? "X"
                      : "N"}
              </span>
              {platformLabels[platform]}
            </Link>
          ))}
      </nav>
      <BestSellers />
      <Deals />
    </div>
  );
}
