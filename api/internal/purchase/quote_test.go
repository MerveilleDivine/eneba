package purchase

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
)

const (
	firstOfferID  = "30000000-0000-4000-8000-000000000001"
	secondOfferID = "30000000-0000-4000-8000-000000000002"
)

func TestQuoteLinesRejectInvalidInput(t *testing.T) {
	valid := QuoteRequestLine{OfferID: firstOfferID, Quantity: 1}
	cases := []struct {
		name  string
		lines []QuoteRequestLine
		ok    bool
	}{
		{name: "empty", lines: nil},
		{name: "normal", lines: []QuoteRequestLine{valid}, ok: true},
		{name: "two distinct", lines: []QuoteRequestLine{valid, {OfferID: secondOfferID, Quantity: 1}}, ok: true},
		{name: "uppercase normalized", lines: []QuoteRequestLine{{OfferID: strings.ToUpper(firstOfferID), Quantity: 1}}, ok: true},
		{name: "duplicates", lines: []QuoteRequestLine{valid, valid}},
		{name: "case insensitive duplicate", lines: []QuoteRequestLine{valid, {OfferID: strings.ToUpper(firstOfferID), Quantity: 1}}},
		{name: "quantity zero", lines: []QuoteRequestLine{{OfferID: firstOfferID, Quantity: 0}}},
		{name: "quantity two", lines: []QuoteRequestLine{{OfferID: firstOfferID, Quantity: 2}}},
		{name: "bad uuid", lines: []QuoteRequestLine{{OfferID: "not-an-id", Quantity: 1}}},
		{name: "eleven lines", lines: []QuoteRequestLine{
			{OfferID: "00000000-0000-4000-8000-000000000000", Quantity: 1},
			{OfferID: "00000000-0000-4000-8000-000000000001", Quantity: 1},
			{OfferID: "00000000-0000-4000-8000-000000000002", Quantity: 1},
			{OfferID: "00000000-0000-4000-8000-000000000003", Quantity: 1},
			{OfferID: "00000000-0000-4000-8000-000000000004", Quantity: 1},
			{OfferID: "00000000-0000-4000-8000-000000000005", Quantity: 1},
			{OfferID: "00000000-0000-4000-8000-000000000006", Quantity: 1},
			{OfferID: "00000000-0000-4000-8000-000000000007", Quantity: 1},
			{OfferID: "00000000-0000-4000-8000-000000000008", Quantity: 1},
			{OfferID: "00000000-0000-4000-8000-000000000009", Quantity: 1},
			{OfferID: "00000000-0000-4000-8000-000000000010", Quantity: 1},
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ids, err := validateLines(tc.lines)
			if (err == nil) != tc.ok {
				t.Fatalf("valid=%t, error=%v", tc.ok, err)
			}
			if tc.ok && len(ids) > 0 && ids[0] != strings.ToLower(tc.lines[0].OfferID) {
				t.Fatalf("offer ID not normalized: %q", ids[0])
			}
		})
	}
}

func TestQuoteTotalsAndUnavailableLines(t *testing.T) {
	name, slug, edition, platform, region, seller := "Solar Drift", "solar-drift", "Standard", "steam", "global", "Orbit Games"
	rating := int16(96)
	price := int64(2300)
	available := QuoteLine{OfferID: firstOfferID, Quantity: 1, ProductName: &name, ProductSlug: &slug,
		Edition: &edition, Platform: &platform, Region: &region, SellerName: &seller,
		SellerRatingPercent: &rating, UnitPriceCents: &price, Available: true}
	q, err := prepareQuote([]string{firstOfferID}, []QuoteLine{available})
	if err != nil || q.TotalCents == nil || *q.TotalCents != price ||
		q.Lines[0].LineTotalCents == nil || *q.Lines[0].LineTotalCents != price {
		t.Fatalf("invalid computed total: %#v, %v", q, err)
	}

	unavailable := QuoteLine{OfferID: secondOfferID, Quantity: 1, Available: false}
	q, err = prepareQuote([]string{firstOfferID, secondOfferID}, []QuoteLine{available, unavailable})
	if err != nil || q.TotalCents != nil || q.Lines[1].LineTotalCents != nil {
		t.Fatalf("unavailable stock incorrectly priced: %#v, %v", q, err)
	}
	overflow := int64(maxSafeCents)
	available.UnitPriceCents = &overflow
	if _, err := prepareQuote([]string{firstOfferID, secondOfferID},
		[]QuoteLine{available, {OfferID: secondOfferID, Quantity: 1, ProductName: &name,
			ProductSlug: &slug, Edition: &edition, Platform: &platform, Region: &region,
			SellerName: &seller, SellerRatingPercent: &rating, UnitPriceCents: &price, Available: true}}); err != ErrQuoteData {
		t.Fatalf("unsafe sum accepted: %v", err)
	}
	available.OfferID = secondOfferID
	if _, err := prepareQuote([]string{firstOfferID}, []QuoteLine{available}); err != ErrQuoteData {
		t.Fatal("wrong offer identity accepted")
	}
}

func TestQuoteHTTPRejectsMalformedRequestsBeforeDatabase(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(NewService(nil), slog.New(slog.NewTextHandler(io.Discard, nil))).RegisterRoutes(mux)
	server := httptest.NewServer(httpapi.Wrap(mux, slog.New(slog.NewTextHandler(io.Discard, nil))))
	defer server.Close()
	tests := []struct {
		name, method, contentType, path, body string
		status, allow                         int
	}{
		{"empty", "POST", "application/json", "/api/v1/cart/quote", `{"lines":[]}`, 400, 0},
		{"quantity", "POST", "application/json", "/api/v1/cart/quote", `{"lines":[{"offerId":"` + firstOfferID + `","quantity":2}]}`, 400, 0},
		{"extra field", "POST", "application/json", "/api/v1/cart/quote", `{"lines":[],"totalCents":1}`, 400, 0},
		{"two json values", "POST", "application/json", "/api/v1/cart/quote", `{"lines":[]} {"lines":[]}`, 400, 0},
		{"wrong media", "POST", "text/plain", "/api/v1/cart/quote", "{}", 415, 0},
		{"query", "POST", "application/json", "/api/v1/cart/quote?price=0", "{}", 400, 0},
		{"wrong method", "GET", "", "/api/v1/cart/quote", "", 405, 1},
		{"oversize", "POST", "application/json", "/api/v1/cart/quote", `{"lines":[],"extra":"` + strings.Repeat("a", 6000) + `"}`, 400, 0},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(tc.method, server.URL+tc.path, bytes.NewBufferString(tc.body))
			if err != nil {
				t.Fatal(err)
			}
			if tc.contentType != "" {
				req.Header.Set("Content-Type", tc.contentType)
			}
			res, err := server.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			if res.StatusCode != tc.status {
				t.Fatalf("got %d, expected %d", res.StatusCode, tc.status)
			}
			if tc.allow == 1 && res.Header.Get("Allow") != "POST" {
				t.Fatal("missing POST method hint")
			}
		})
	}
}
