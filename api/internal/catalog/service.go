package catalog

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"
)

type Service struct{ repository *Repository }

func NewService(repository *Repository) *Service { return &Service{repository: repository} }

func (s *Service) List(ctx context.Context, filter Filter) (Page, error) {
	filter, err := normalizeFilter(filter)
	if err != nil {
		return Page{}, err
	}
	page, err := s.repository.List(ctx, filter)
	if err != nil {
		return Page{}, err
	}
	if err := prepareProducts(page.Items); err != nil {
		return Page{}, err
	}
	page.Currency = "EUR"
	return page, nil
}

func normalizeFilter(filter Filter) (Filter, error) {
	invalid := func(message string) (Filter, error) { return Filter{}, fmt.Errorf("%w: %s", ErrInvalidQuery, message) }
	if !utf8.ValidString(filter.Query) || strings.ContainsRune(filter.Query, 0) {
		return invalid("q must be valid text")
	}
	filter.Query = strings.TrimSpace(filter.Query)
	if utf8.RuneCountInString(filter.Query) > 100 {
		return invalid("q must contain at most 100 characters")
	}
	if filter.Platform != "" && !supportedPlatform(filter.Platform) {
		return invalid("platform is not supported")
	}
	if filter.Region != "" && !supportedRegion(filter.Region) {
		return invalid("region is not supported")
	}
	if filter.Sort == "" {
		filter.Sort = "name_asc"
		if filter.Query != "" {
			filter.Sort = "relevance"
		}
	}
	switch filter.Sort {
	case "relevance", "name_asc", "price_asc", "price_desc":
	default:
		return invalid("sort is not supported")
	}
	for _, value := range []*int64{filter.MinPriceCents, filter.MaxPriceCents} {
		if value != nil && (*value < 0 || *value > maxSafeInteger) {
			return invalid("price bounds must be nonnegative safe integer cents")
		}
	}
	if filter.MinPriceCents != nil && filter.MaxPriceCents != nil && *filter.MinPriceCents > *filter.MaxPriceCents {
		return invalid("minPriceCents cannot exceed maxPriceCents")
	}
	if filter.Page < 1 || filter.Page > maxSafeInteger {
		return invalid("page must be a positive safe integer")
	}
	if filter.PageSize < 1 || filter.PageSize > 50 {
		return invalid("pageSize must be between 1 and 50")
	}
	// A safe-integer page multiplied by at most 50 fits in an int64 offset.
	return filter, nil
}

func prepareProducts(products []Product) error {
	for i := range products {
		if err := PrepareProduct(&products[i]); err != nil {
			return err
		}
	}
	return nil
}

// PrepareProduct keeps public SKU reads and homepage projections consistent
// with catalog's safe-price and inventory-availability semantics.
func PrepareProduct(product *Product) error {
	price := product.LowestPriceCents
	if price != nil && (*price <= 0 || *price > maxSafeInteger) {
		return errInvalidPrice
	}
	product.Available = price != nil
	return nil
}

func supportedPlatform(value string) bool {
	switch value {
	case "steam", "xbox", "playstation", "nintendo", "other":
		return true
	default:
		return false
	}
}

func supportedRegion(value string) bool {
	switch value {
	case "global", "europe", "united-states":
		return true
	default:
		return false
	}
}
