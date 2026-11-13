// Package catalog owns public product discovery and its available-offer prices.
package catalog

import "errors"

const maxSafeInteger int64 = 9007199254740991

var (
	ErrInvalidQuery = errors.New("invalid catalog query")
	errInvalidPrice = errors.New("catalog contains an invalid stored price")
)

type Filter struct {
	Query         string
	Platform      string
	Region        string
	Sort          string
	MinPriceCents *int64
	MaxPriceCents *int64
	Page          int64
	PageSize      int64
}

type Product struct {
	ID               string `json:"id"`
	Slug             string `json:"slug"`
	Name             string `json:"name"`
	Edition          string `json:"edition"`
	Platform         string `json:"platform"`
	Region           string `json:"region"`
	CoverURL         string `json:"coverUrl"`
	LowestPriceCents *int64 `json:"lowestPriceCents"`
	Available        bool   `json:"available"`
}

type Page struct {
	Items    []Product `json:"items"`
	Page     int64     `json:"page"`
	PageSize int64     `json:"pageSize"`
	Total    int64     `json:"total"`
	Currency string    `json:"currency"`
}
