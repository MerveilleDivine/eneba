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
func (r *BannerRepository) List(ctx context.Context) ([]Banner, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id::text, headline, subheading, image_url, link_href, position
		FROM marketplace.homepage_banners
		WHERE active
		ORDER BY position ASC, id ASC
		LIMIT $1
	`, maxBanners)
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
