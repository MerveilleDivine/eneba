package home

import (
	"context"
	"regexp"
	"strings"
	"unicode/utf8"
)

const (
	maxDeals                 = 8
	dealCandidateLimit       = 32
	maxDealSafeCents   int64 = 9007199254740991
	maxDealName              = 140
	maxDealEdition           = 80
	maxDealSeller            = 100
	maxDealSlug              = 160
	maxDealCover             = 400
)

var (
	dealSlugPattern  = regexp.MustCompile("^[a-z0-9]+(?:-[a-z0-9]+)*$")
	dealCoverPattern = regexp.MustCompile("^/images/covers/[a-z0-9][a-z0-9_-]*[.](?:webp|svg)$")
)

type Deal struct {
	OfferID         string `json:"offerId"`
	ProductID       string `json:"productId"`
	Slug            string `json:"slug"`
	Name            string `json:"name"`
	Edition         string `json:"edition"`
	Platform        string `json:"platform"`
	Region          string `json:"region"`
	CoverURL        string `json:"coverUrl"`
	SellerName      string `json:"sellerName"`
	PriceCents      int64  `json:"priceCents"`
	ListPriceCents  int64  `json:"listPriceCents"`
	DiscountPercent int64  `json:"discountPercent"`
	Position        int32  `json:"position"`
}

type DealPage struct {
	Items    []Deal `json:"items"`
	Currency string `json:"currency"`
}

type DealRejection struct {
	OfferID string
	Reason  string
}

type DealService struct {
	repository *DealRepository
}

func NewDealService(repository *DealRepository) *DealService {
	return &DealService{repository: repository}
}

// Return up to eight *valid* offer-specific deals. Never replace a seller's
// price with the catalog minimum or assume a read-only quote reserves stock.
func (s *DealService) List(ctx context.Context) (DealPage, []DealRejection, error) {
	candidates, err := s.repository.List(ctx)
	if err != nil {
		return DealPage{}, nil, err
	}
	page := DealPage{Items: make([]Deal, 0, maxDeals), Currency: "EUR"}
	rejected := make([]DealRejection, 0)
	for _, deal := range candidates {
		if reason := invalidDealReason(deal); reason != "" {
			rejected = append(rejected, DealRejection{OfferID: deal.OfferID, Reason: reason})
			continue
		}
		// Both amounts are positive and <= MAX_SAFE_INTEGER: the difference
		// times 100 is strictly below int64's limit. Integer division floors.
		deal.DiscountPercent = dealDiscountPercent(deal.PriceCents, deal.ListPriceCents)
		page.Items = append(page.Items, deal)
		if len(page.Items) == maxDeals {
			break
		}
	}
	return page, rejected, nil
}

func invalidDealReason(deal Deal) string {
	if deal.OfferID == "" || deal.ProductID == "" || deal.Position < 0 {
		return "invalid_identity"
	}
	if deal.PriceCents <= 0 || deal.ListPriceCents <= deal.PriceCents ||
		deal.ListPriceCents > maxDealSafeCents {
		return "invalid_price"
	}
	if len(deal.Slug) > maxDealSlug || !dealSlugPattern.MatchString(deal.Slug) ||
		!validDealText(deal.Name, maxDealName) ||
		!validDealText(deal.Edition, maxDealEdition) ||
		!validDealText(deal.SellerName, maxDealSeller) {
		return "invalid_text"
	}
	if len(deal.CoverURL) > maxDealCover || !dealCoverPattern.MatchString(deal.CoverURL) {
		return "invalid_cover"
	}
	switch deal.Platform {
	case "steam", "xbox", "playstation", "nintendo", "other":
	default:
		return "invalid_platform"
	}
	switch deal.Region {
	case "global", "europe", "united-states":
	default:
		return "invalid_region"
	}
	return ""
}

func validDealText(value string, maximum int) bool {
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) > maximum ||
		strings.TrimSpace(value) == "" {
		return false
	}
	for _, character := range value {
		if character < 32 || character == 127 {
			return false
		}
	}
	return true
}

// dealDiscountPercent may only be called after validating positive, safe
// prices. Both operands fit int64 even after multiplying savings by 100.
func dealDiscountPercent(price, listPrice int64) int64 {
	return (listPrice - price) * 100 / listPrice
}
