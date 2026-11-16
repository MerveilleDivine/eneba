package home

import (
	"context"
	"errors"

	"github.com/MerveilleDivine/eneba/api/internal/catalog"
)

var errInvalidBestSeller = errors.New("invalid stored best seller")

const maxBestSellers = 8

// BestSeller uses the authoritative catalog SKU projection and adds only the
// fictional demo ranking stored in homepage_best_sellers.
type BestSeller struct {
	catalog.Product
	DemoWeeklySales int32 `json:"demoWeeklySales"`
}

type BestSellerPage struct {
	Items    []BestSeller `json:"items"`
	Currency string       `json:"currency"`
}

type BestSellerService struct {
	repository *BestSellerRepository
}

func NewBestSellerService(repository *BestSellerRepository) *BestSellerService {
	return &BestSellerService{repository: repository}
}

func (s *BestSellerService) List(ctx context.Context) (BestSellerPage, error) {
	items, err := s.repository.List(ctx)
	if err != nil {
		return BestSellerPage{}, err
	}
	for i := range items {
		if items[i].DemoWeeklySales < 0 {
			return BestSellerPage{}, errInvalidBestSeller
		}
		if err := catalog.PrepareProduct(&items[i].Product); err != nil {
			return BestSellerPage{}, err
		}
	}
	return BestSellerPage{Items: items, Currency: "EUR"}, nil
}
