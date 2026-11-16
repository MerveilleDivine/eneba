package purchase

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"fmt"
	"sort"
	"strings"
)

var (
	ErrInvalidCheckout     = errors.New("invalid checkout")
	ErrPriceChanged        = errors.New("price changed")
	ErrOutOfStock          = errors.New("out of stock")
	ErrIdempotencyConflict = errors.New("idempotency conflict")
	ErrBuyerNotFound       = errors.New("buyer not found")
)

type PurchaseRequestLine struct {
	OfferID                string `json:"offerId"`
	Quantity               int    `json:"quantity"`
	ExpectedUnitPriceCents int64  `json:"expectedUnitPriceCents"`
}
type PurchaseRequest struct {
	Lines []PurchaseRequestLine `json:"lines"`
}
type PurchaseResult struct {
	OrderID    string `json:"orderId"`
	TotalCents int64  `json:"totalCents"`
}
type CheckoutService struct{ repository *Repository }

func NewCheckoutService(repository *Repository) *CheckoutService {
	return &CheckoutService{repository: repository}
}

// Canonicalizing lines prevents order, casing or JSON encoding from influencing
// the idempotent identity of an otherwise identical purchase attempt.
func validatePurchase(request PurchaseRequest, idempotencyKey string) ([]PurchaseRequestLine, [32]byte, error) {
	var zero [32]byte
	if !offerIDPattern.MatchString(idempotencyKey) ||
		len(request.Lines) == 0 || len(request.Lines) > maxQuoteLines {
		return nil, zero, ErrInvalidCheckout
	}
	lines := make([]PurchaseRequestLine, len(request.Lines))
	copy(lines, request.Lines)
	seen := make(map[string]struct{}, len(lines))
	for i := range lines {
		if !offerIDPattern.MatchString(lines[i].OfferID) ||
			lines[i].Quantity != 1 || !priceSafe(lines[i].ExpectedUnitPriceCents) {
			return nil, zero, ErrInvalidCheckout
		}
		lines[i].OfferID = strings.ToLower(lines[i].OfferID)
		if _, exists := seen[lines[i].OfferID]; exists {
			return nil, zero, ErrInvalidCheckout
		}
		seen[lines[i].OfferID] = struct{}{}
	}
	sort.Slice(lines, func(i, j int) bool { return lines[i].OfferID < lines[j].OfferID })
	var canonical strings.Builder
	for _, line := range lines {
		fmt.Fprintf(&canonical, "%s:%d:%d\n", line.OfferID, line.Quantity, line.ExpectedUnitPriceCents)
	}
	return lines, sha256.Sum256([]byte(canonical.String())), nil
}

// Purchase must not recheck prices or stock on a matching idempotent retry.
// Only the repository can serialize buyer and offer locks in the same transaction.
func (s *CheckoutService) Purchase(ctx context.Context, buyerID, idempotencyKey string, request PurchaseRequest) (PurchaseResult, error) {
	lines, hash, err := validatePurchase(request, idempotencyKey)
	if err != nil {
		return PurchaseResult{}, err
	}
	if !offerIDPattern.MatchString(buyerID) {
		return PurchaseResult{}, ErrBuyerNotFound
	}
	return s.repository.CommitPurchase(ctx, strings.ToLower(buyerID), strings.ToLower(idempotencyKey), lines, hash)
}

func matchingFingerprint(a, b []byte) bool {
	return len(a) == sha256.Size && len(b) == sha256.Size && subtle.ConstantTimeCompare(a, b) == 1
}
