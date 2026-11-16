package home

import (
	"context"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/jackc/pgx/v5/pgxpool"
)

type BannerRepository struct {
	pool *pgxpool.Pool
}

func NewBannerRepository(pool *pgxpool.Pool) *BannerRepository {
	return &BannerRepository{pool: pool}
}

// A single ordered, bounded query owns the banner projection.
// LEFT prevents oversized stored text from becoming an oversized API read;
// the +1 sentinel still allows validation to reject out-of-bounds content.
func (r *BannerRepository) List(ctx context.Context) ([]Banner, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id::text,
			LEFT(headline, $2),
			LEFT(subheading, $3),
			LEFT(image_url, $4),
			LEFT(link_href, $5),
			position
		FROM marketplace.homepage_banners
		WHERE active
		ORDER BY position ASC, id ASC
		LIMIT $1
	`, bannerCandidateLimit,
		maxBannerHeadline+1, maxBannerSubheading+1, maxBannerImageLength+1, maxBannerLinkLength+1)
	if err != nil {
		return nil, database.ClassifyReadError(err)
	}
	defer rows.Close()

	banners := make([]Banner, 0, maxBanners)
	for rows.Next() {
		var banner Banner
		if err := rows.Scan(&banner.ID, &banner.Headline, &banner.Subheading,
			&banner.ImageURL, &banner.LinkHref, &banner.Position); err != nil {
			return nil, database.ClassifyReadError(err)
		}
		banners = append(banners, banner)
	}
	if err := rows.Err(); err != nil {
		return nil, database.ClassifyReadError(err)
	}
	return banners, nil
}
