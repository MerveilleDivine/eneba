package home

import (
	"strings"
	"testing"
)

func validDealFixture() Deal {
	return Deal{
		OfferID:   "30000000-0000-4000-8000-000000000003",
		ProductID: "10000000-0000-4000-8000-000000000002",
		Slug:      "the-last-outpost", Name: "The Last Outpost", Edition: "Standard",
		Platform: "xbox", Region: "europe",
		CoverURL:   "/images/covers/the-last-outpost.webp",
		SellerName: "Purple Lantern", PriceCents: 1273, ListPriceCents: 1873,
		Position: 0,
	}
}

func TestDealValidation(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*Deal)
		reason string
	}{
		{"valid", func(*Deal) {}, ""},
		{"zero price", func(d *Deal) { d.PriceCents = 0 }, "invalid_price"},
		{"equal price", func(d *Deal) { d.ListPriceCents = d.PriceCents }, "invalid_price"},
		{"over safe integer", func(d *Deal) { d.ListPriceCents = maxDealSafeCents + 1 }, "invalid_price"},
		{"invalid seller", func(d *Deal) { d.SellerName = strings.Repeat("s", maxDealSeller+1) }, "invalid_text"},
		{"unsafe cover", func(d *Deal) { d.CoverURL = "//example.test/cover.webp" }, "invalid_cover"},
		{"bad slug", func(d *Deal) { d.Slug = "../other" }, "invalid_text"},
		{"inactive platform", func(d *Deal) { d.Platform = "unknown" }, "invalid_platform"},
		{"bad region", func(d *Deal) { d.Region = "mars" }, "invalid_region"},
		{"negative position", func(d *Deal) { d.Position = -1 }, "invalid_identity"},
		{"control chars", func(d *Deal) { d.Name = "Sale\nNow" }, "invalid_text"},
	}
	for _, testcase := range cases {
		t.Run(testcase.name, func(t *testing.T) {
			deal := validDealFixture()
			testcase.mutate(&deal)
			if actual := invalidDealReason(deal); actual != testcase.reason {
				t.Fatalf("got %q, want %q", actual, testcase.reason)
			}
		})
	}
}

func TestDiscountBounds(t *testing.T) {
	deal := validDealFixture()
	if reason := invalidDealReason(deal); reason != "" {
		t.Fatal(reason)
	}
	discount := dealDiscountPercent(deal.PriceCents, deal.ListPriceCents)
	if discount != 32 {
		t.Fatalf("unexpected discount: %d", discount)
	}
	deal.PriceCents = maxDealSafeCents - 1
	deal.ListPriceCents = maxDealSafeCents
	if reason := invalidDealReason(deal); reason != "" {
		t.Fatal(reason)
	}
	discount = dealDiscountPercent(deal.PriceCents, deal.ListPriceCents)
	if discount != 0 {
		t.Fatalf("small but positive savings cannot round up: %d", discount)
	}
}
