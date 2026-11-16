package purchase

import (
	"context"
	"errors"
	"regexp"
	"strings"
)

const (
	maxQuoteLines = 10
	maxSafeCents  = 9007199254740991
)

var (
	ErrInvalidCart = errors.New("invalid cart")
	ErrQuoteData   = errors.New("invalid quote data")
	offerIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

type QuoteRequestLine struct {
	OfferID  string `json:"offerId"`
	Quantity int    `json:"quantity"`
}

type QuoteRequest struct {
	Lines []QuoteRequestLine `json:"lines"`
}

type QuoteLine struct {
	OfferID             string  `json:"offerId"`
	Quantity            int     `json:"quantity"`
	ProductSlug         *string `json:"productSlug"`
	ProductName         *string `json:"productName"`
	Edition             *string `json:"edition"`
	Platform            *string `json:"platform"`
	Region              *string `json:"region"`
	SellerName          *string `json:"sellerName"`
	SellerRatingPercent *int16  `json:"sellerRatingPercent"`
	UnitPriceCents      *int64  `json:"unitPriceCents"`
	LineTotalCents      *int64  `json:"lineTotalCents"`
	Available           bool    `json:"available"`
}

type Quote struct {
	Lines      []QuoteLine `json:"lines"`
	TotalCents *int64      `json:"totalCents"`
	Currency   string      `json:"currency"`
}

type Service struct {
	repository *Repository
}

func NewService(repository *Repository) *Service {
	return &Service{repository: repository}
}

func validateLines(lines []QuoteRequestLine) ([]string, error) {
	if len(lines) < 1 || len(lines) > maxQuoteLines {
		return nil, ErrInvalidCart
	}
	ids := make([]string, 0, len(lines))
	seen := make(map[string]struct{}, len(lines))
	for _, line := range lines {
		if line.Quantity != 1 || !offerIDPattern.MatchString(line.OfferID) {
			return nil, ErrInvalidCart
		}
		id := strings.ToLower(line.OfferID)
		if _, exists := seen[id]; exists {
			return nil, ErrInvalidCart
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids, nil
}

func priceSafe(price int64) bool {
	return price > 0 && price <= maxSafeCents
}

// A quote never reserves stock; a successful checkout must recheck prices and
// unallocated keys in a separate write transaction.
func prepareQuote(ids []string, lines []QuoteLine) (Quote, error) {
	if len(ids) != len(lines) {
		return Quote{}, ErrQuoteData
	}
	var total int64
	allAvailable := true
	for i := range lines {
		line := &lines[i]
		if line.OfferID != ids[i] || line.Quantity != 1 {
			return Quote{}, ErrQuoteData
		}
		if line.UnitPriceCents != nil && !priceSafe(*line.UnitPriceCents) {
			return Quote{}, ErrQuoteData
		}
		if line.SellerRatingPercent != nil && (*line.SellerRatingPercent < 0 || *line.SellerRatingPercent > 100) {
			return Quote{}, ErrQuoteData
		}
		if !line.Available {
			allAvailable = false
			continue
		}
		if line.UnitPriceCents == nil || line.ProductName == nil || line.ProductSlug == nil ||
			line.Edition == nil || line.Platform == nil || line.Region == nil ||
			line.SellerName == nil || line.SellerRatingPercent == nil {
			return Quote{}, ErrQuoteData
		}
		if *line.UnitPriceCents > maxSafeCents-total {
			return Quote{}, ErrQuoteData
		}
		value := *line.UnitPriceCents
		line.LineTotalCents = &value
		total += value
	}
	result := Quote{Lines: lines, Currency: "EUR"}
	if allAvailable {
		result.TotalCents = &total
	}
	return result, nil
}

func (s *Service) Quote(ctx context.Context, request QuoteRequest) (Quote, error) {
	ids, err := validateLines(request.Lines)
	if err != nil {
		return Quote{}, err
	}
	lines, err := s.repository.ReadQuote(ctx, ids)
	if err != nil {
		return Quote{}, err
	}
	return prepareQuote(ids, lines)
}
