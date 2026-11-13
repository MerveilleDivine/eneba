package catalog

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestCatalogFilterContract(t *testing.T) {
	for _, tt := range []struct{ name, query string }{
		{"unknown parameter", "unexpected=value"},
		{"repeated search", "q=one&q=two"},
		{"repeated pagination", "page=1&page=2"},
		{"bad encoding", "q=%invalid"},
		{"invalid UTF8", "q=%FF"},
		{"nul text", "q=%00"},
		{"long search", "q=" + strings.Repeat("a", 101)},
		{"unsupported platform", "platform=pc"},
		{"unsupported region", "region=everywhere"},
		{"unsafe sort", "sort=price%3BDROP"},
		{"zero page", "page=0"},
		{"negative page", "page=-1"},
		{"empty page", "page="},
		{"fractional page", "page=1.5"},
		{"offset overflow", "page=9223372036854775807&pageSize=50"},
		{"integer overflow", "page=9223372036854775808"},
		{"zero page size", "pageSize=0"},
		{"excessive page size", "pageSize=51"},
		{"negative price", "minPriceCents=-1"},
		{"unsafe price", "maxPriceCents=9007199254740992"},
		{"fractional cents", "minPriceCents=1.5"},
		{"empty cents", "maxPriceCents="},
		{"inverted bounds", "minPriceCents=200&maxPriceCents=100"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			filter, err := parseFilter(tt.query)
			if err == nil {
				_, err = normalizeFilter(filter)
			}
			if !errors.Is(err, ErrInvalidQuery) {
				t.Fatalf("expected invalid query, got %v", err)
			}
		})
	}
}

func TestCatalogDefaultsAndBoundaries(t *testing.T) {
	if _, err := normalizeFilter(Filter{Query: strings.Repeat("界", 100), Page: 1, PageSize: 24}); err != nil {
		t.Fatal("search length must count Unicode characters rather than bytes")
	}
	for _, tt := range []struct{ query, search, sort string }{
		{"", "", "name_asc"},
		{"q=++Solar+Drift++", "Solar Drift", "relevance"},
		{"q=Solar&sort=price_desc", "Solar", "price_desc"},
		{"q=%E7%95%8C", "界", "relevance"},
	} {
		filter, err := parseFilter(tt.query)
		if err != nil {
			t.Fatal(err)
		}
		filter, err = normalizeFilter(filter)
		if err != nil {
			t.Fatal(err)
		}
		if filter.Query != tt.search || filter.Sort != tt.sort || filter.Page != 1 || filter.PageSize != 24 {
			t.Fatalf("unexpected defaults: %+v", filter)
		}
	}
	filter, err := parseFilter("minPriceCents=0&maxPriceCents=9007199254740991&pageSize=50&page=9007199254740991")
	if err != nil {
		t.Fatal(err)
	}
	filter, err = normalizeFilter(filter)
	if err != nil || *filter.MinPriceCents != 0 || *filter.MaxPriceCents != maxSafeInteger || (filter.Page-1)*filter.PageSize < 0 {
		t.Fatal("supported integer boundaries changed")
	}
}

func TestCatalogMoneyProjection(t *testing.T) {
	for _, tt := range []struct {
		name  string
		price *int64
		valid bool
	}{
		{"sold out", nil, true},
		{"minimum", pricePointer(1), true},
		{"maximum", pricePointer(maxSafeInteger), true},
		{"zero", pricePointer(0), false},
		{"negative", pricePointer(-1), false},
		{"unsafe", pricePointer(maxSafeInteger + 1), false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			products := []Product{{LowestPriceCents: tt.price}}
			err := prepareProducts(products)
			if (err == nil) != tt.valid {
				t.Fatalf("valid=%v error=%v", tt.valid, err)
			}
			if err == nil && products[0].Available != (tt.price != nil) {
				t.Fatal("availability does not match available price")
			}
		})
	}
}

func TestReadErrorPolicy(t *testing.T) {
	for _, err := range []error{context.Canceled, context.DeadlineExceeded, &pgconn.PgError{Code: "08006"}, &pgconn.PgError{Code: "28P01"}, &pgconn.PgError{Code: "53300"}, &pgconn.PgError{Code: "57014"}, &pgconn.PgError{Code: "57P01"}} {
		if !errors.Is(classifyReadError(err), database.ErrUnavailable) {
			t.Fatal("operational failure must be unavailable")
		}
	}
	unexpected := &pgconn.PgError{Code: "42P01", Message: "private SQL details"}
	if errors.Is(classifyReadError(unexpected), database.ErrUnavailable) {
		t.Fatal("SQL programming errors must remain internal failures")
	}
}

func pricePointer(value int64) *int64 { return &value }
