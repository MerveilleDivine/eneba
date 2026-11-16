package catalog

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const maxProductOffers = 50

var (
	ErrInvalidProductSlug = errors.New("invalid product slug")
	ErrProductNotFound    = errors.New("product not found")
	errInvalidProductData = errors.New("product contains invalid public data")
	productSlugPattern    = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
)

type ProductInfo struct {
	Product
	Description            string `json:"description"`
	ActivationInstructions string `json:"activationInstructions"`
}

// Offer identity is distinct from its SKU and seller. Availability is a read,
// never a reservation, and contains no key or allocation identifiers.
type SellerOffer struct {
	OfferID             string `json:"offerId"`
	SellerID            string `json:"sellerId"`
	SellerName          string `json:"sellerName"`
	SellerRatingPercent int16  `json:"sellerRatingPercent"`
	PriceCents          int64  `json:"priceCents"`
	ListPriceCents      *int64 `json:"listPriceCents"`
	Available           bool   `json:"available"`
}

type ProductDetails struct {
	Product  ProductInfo   `json:"product"`
	Offers   []SellerOffer `json:"offers"`
	Currency string        `json:"currency"`
}

func validProductSlug(slug string) bool {
	return len(slug) <= 160 && productSlugPattern.MatchString(slug)
}

func (s *Service) GetProduct(ctx context.Context, slug string) (ProductDetails, error) {
	if !validProductSlug(slug) {
		return ProductDetails{}, ErrInvalidProductSlug
	}
	details, err := s.repository.GetProduct(ctx, slug)
	if err != nil {
		return ProductDetails{}, err
	}
	if err := prepareProductDetails(&details); err != nil {
		return ProductDetails{}, err
	}
	return details, nil
}

func prepareProductDetails(details *ProductDetails) error {
	p := &details.Product
	if !validProductSlug(p.Slug) || !validProductText(p.Name, 140, false) ||
		!validProductText(p.Edition, 80, false) || !validProductText(p.Description, 5000, true) ||
		!validProductText(p.ActivationInstructions, 1000, true) || strings.TrimFunc(p.ActivationInstructions, func(r rune) bool { return unicode.IsSpace(r) || r == '\uFEFF' }) == "" ||
		!validProductCover(p.CoverURL) || len(details.Offers) > maxProductOffers {
		return errInvalidProductData
	}
	if _, err := normalizeFilter(Filter{Platform: p.Platform, Region: p.Region, Page: 1, PageSize: 1}); err != nil {
		return errInvalidProductData
	}
	if err := PrepareProduct(&p.Product); err != nil {
		return err
	}
	var lowest *int64
	for i := range details.Offers {
		offer := &details.Offers[i]
		if !validProductText(offer.SellerName, 100, false) ||
			offer.SellerRatingPercent < 0 || offer.SellerRatingPercent > 100 ||
			offer.PriceCents <= 0 || offer.PriceCents > maxSafeInteger ||
			(offer.ListPriceCents != nil && (*offer.ListPriceCents <= offer.PriceCents || *offer.ListPriceCents > maxSafeInteger)) {
			return errInvalidProductData
		}
		if offer.Available && (lowest == nil || offer.PriceCents < *lowest) {
			lowest = &offer.PriceCents
		}
	}
	// Guard against future query drift: the advertised "From" price must be
	// represented by an available offer in this same snapshot.
	if (lowest == nil) != (p.LowestPriceCents == nil) ||
		(lowest != nil && *lowest != *p.LowestPriceCents) {
		return errInvalidProductData
	}
	details.Currency = "EUR"
	return nil
}

func validProductText(value string, limit int, multiline bool) bool {
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) > limit {
		return false
	}
	if !multiline && strings.TrimFunc(value, func(r rune) bool { return unicode.IsSpace(r) || r == '\uFEFF' }) == "" {
		return false
	}
	for _, r := range value {
		if (r < 32 && !(multiline && (r == '\n' || r == '\r' || r == '\t'))) || r == 127 ||
			(r >= '\u200e' && r <= '\u200f') || (r >= '\u202a' && r <= '\u202e') ||
			(r >= '\u2066' && r <= '\u2069') {
			return false
		}
	}
	return true
}

func validProductCover(value string) bool {
	if len(value) > 400 || !validProductText(value, 400, false) || strings.Contains(value, "\\") {
		return false
	}
	if strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//") {
		return true
	}
	u, err := url.Parse(value)
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil
}
