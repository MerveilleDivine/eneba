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

func TestPurchaseCanonicalizationAndValidation(t *testing.T) {
	first := PurchaseRequestLine{OfferID: firstOfferID, Quantity: 1, ExpectedUnitPriceCents: 1500}
	second := PurchaseRequestLine{OfferID: secondOfferID, Quantity: 1, ExpectedUnitPriceCents: 2500}
	key := "10000000-0000-4000-8000-000000000000"
	a, hash, err := validatePurchase(PurchaseRequest{Lines: []PurchaseRequestLine{second, first}}, key)
	if err != nil || len(a) != 2 || a[0].OfferID != firstOfferID {
		t.Fatalf("order: %v %#v", err, a)
	}
	_, same, err := validatePurchase(PurchaseRequest{Lines: []PurchaseRequestLine{first, second}}, key)
	if err != nil || hash != same {
		t.Fatal("line order changes idempotency fingerprint")
	}
	change := second
	change.ExpectedUnitPriceCents = 2501
	_, different, err := validatePurchase(PurchaseRequest{Lines: []PurchaseRequestLine{first, change}}, key)
	if err != nil || hash == different {
		t.Fatal("changed line price reused fingerprint")
	}
	if !matchingFingerprint(hash[:], same[:]) || matchingFingerprint(hash[:], different[:]) {
		t.Fatal("fingerprint comparison is wrong")
	}
	cases := []struct {
		name, key string
		lines     []PurchaseRequestLine
	}{
		{"bad key", "not-a-uuid", []PurchaseRequestLine{first}},
		{"empty", key, nil},
		{"duplicate", key, []PurchaseRequestLine{first, first}},
		{"duplicate casing", key, []PurchaseRequestLine{first, {OfferID: strings.ToUpper(firstOfferID), Quantity: 1, ExpectedUnitPriceCents: 1500}}},
		{"bad offer", key, []PurchaseRequestLine{{OfferID: "bad", Quantity: 1, ExpectedUnitPriceCents: 1}}},
		{"quantity zero", key, []PurchaseRequestLine{{OfferID: firstOfferID, Quantity: 0, ExpectedUnitPriceCents: 1}}},
		{"quantity two", key, []PurchaseRequestLine{{OfferID: firstOfferID, Quantity: 2, ExpectedUnitPriceCents: 1}}},
		{"price zero", key, []PurchaseRequestLine{{OfferID: firstOfferID, Quantity: 1, ExpectedUnitPriceCents: 0}}},
		{"unsafe price", key, []PurchaseRequestLine{{OfferID: firstOfferID, Quantity: 1, ExpectedUnitPriceCents: maxSafeCents + 1}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, err := validatePurchase(PurchaseRequest{Lines: tc.lines}, tc.key); err != ErrInvalidCheckout {
				t.Fatalf("wanted ErrInvalidCheckout, got %v", err)
			}
		})
	}
	if _, _, err := validatePurchase(PurchaseRequest{Lines: []PurchaseRequestLine{first}}, key); err != nil {
		t.Fatal(err)
	}
}

func TestCheckoutHTTPRejectsOriginAndAnonymousWithoutDatabase(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	mux := http.NewServeMux()
	NewCheckoutHandler(nil, nil, logger, "https://store.example", true).RegisterRoutes(mux)
	server := httptest.NewServer(httpapi.Wrap(mux, logger))
	defer server.Close()
	cases := []struct {
		method, origin string
		code           int
	}{
		{"GET", "", 405}, {"POST", "", 403}, {"POST", "https://attacker.example", 403}, {"POST", "https://store.example", 401},
	}
	for _, tc := range cases {
		req, _ := http.NewRequest(tc.method, server.URL+"/api/v1/checkout", bytes.NewReader([]byte("{}")))
		if tc.origin != "" {
			req.Header.Set("Origin", tc.origin)
		}
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != tc.code {
			t.Fatalf("%s origin=%q got %d want %d", tc.method, tc.origin, res.StatusCode, tc.code)
		}
	}
}
