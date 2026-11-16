package purchase

import (
	"context"
	"errors"
	"math"
	"net/url"
	"strconv"
	"time"
)

var (
	ErrInvalidOrderQuery = errors.New("invalid order query")
	ErrOrderNotFound     = errors.New("order not found")
)

type OrderSummary struct {
	ID         string    `json:"id"`
	CreatedAt  time.Time `json:"createdAt"`
	TotalCents int64     `json:"totalCents"`
	Currency   string    `json:"currency"`
	ItemCount  int       `json:"itemCount"`
}

type OrderPage struct {
	Items    []OrderSummary `json:"items"`
	Page     int64          `json:"page"`
	PageSize int64          `json:"pageSize"`
	Total    int64          `json:"total"`
}

type OrderItem struct {
	ID             string `json:"id"`
	ProductName    string `json:"productName"`
	SellerName     string `json:"sellerName"`
	UnitPriceCents int64  `json:"unitPriceCents"`
	KeyCode        string `json:"keyCode"`
}

type OrderDetail struct {
	ID         string      `json:"id"`
	CreatedAt  time.Time   `json:"createdAt"`
	TotalCents int64       `json:"totalCents"`
	Currency   string      `json:"currency"`
	Items      []OrderItem `json:"items"`
}

type orderPagination struct{ page, size, offset int64 }

func parseOrderPagination(raw string) (orderPagination, error) {
	page := orderPagination{page: 1, size: 20}
	values, err := url.ParseQuery(raw)
	if err != nil {
		return page, ErrInvalidOrderQuery
	}
	for name, entries := range values {
		if len(entries) != 1 || (name != "page" && name != "pageSize") {
			return page, ErrInvalidOrderQuery
		}
		// Decimal digits only: signs and whitespace are not pagination syntax.
		for _, r := range entries[0] {
			if r < '0' || r > '9' {
				return page, ErrInvalidOrderQuery
			}
		}
		n, err := strconv.ParseInt(entries[0], 10, 64)
		if err != nil || n < 1 {
			return page, ErrInvalidOrderQuery
		}
		if name == "page" {
			page.page = n
		} else {
			page.size = n
		}
	}
	if page.size > 50 || page.page > maxSafeCents || page.page-1 > math.MaxInt64/page.size {
		return page, ErrInvalidOrderQuery
	}
	page.offset = (page.page - 1) * page.size
	return page, nil
}

type OrderService struct{ repository *Repository }

func NewOrderService(repository *Repository) *OrderService {
	return &OrderService{repository: repository}
}

func (s *OrderService) List(ctx context.Context, buyerID, rawQuery string) (OrderPage, error) {
	pagination, err := parseOrderPagination(rawQuery)
	if err != nil {
		return OrderPage{}, err
	}
	if !offerIDPattern.MatchString(buyerID) {
		return OrderPage{}, ErrBuyerNotFound
	}
	return s.repository.ListOrders(ctx, buyerID, pagination)
}

func (s *OrderService) Detail(ctx context.Context, buyerID, orderID string) (OrderDetail, error) {
	if !offerIDPattern.MatchString(buyerID) {
		return OrderDetail{}, ErrBuyerNotFound
	}
	if !offerIDPattern.MatchString(orderID) {
		return OrderDetail{}, ErrInvalidOrderQuery
	}
	return s.repository.ReadOrder(ctx, buyerID, orderID)
}
