package catalog

import (
	"errors"
	"strings"
	"testing"
)

func TestProductSlug(t *testing.T) {
	for _, slug := range []string{"solar-drift", "game-2", strings.Repeat("a", 160)} {
		if !validProductSlug(slug) {
			t.Fatalf("rejected valid slug %q", slug)
		}
	}
	for _, slug := range []string{"", "Solar", "game_2", "../game", "game/other", "game--2", "-game", "game-", strings.Repeat("a", 161)} {
		if validProductSlug(slug) {
			t.Fatalf("accepted invalid slug %q", slug)
		}
	}
}

func TestProductProjectionValidation(t *testing.T) {
	price := int64(1234)
	fixture := func() ProductDetails {
		return ProductDetails{
			Product: ProductInfo{Product: Product{Slug: "solar-drift", Name: "Solar Drift", Edition: "Standard", Platform: "steam", Region: "global", CoverURL: "/images/covers/solar-drift.webp", LowestPriceCents: &price}, Description: "A fictional game.\nNo real license.", ActivationInstructions: "Redeem with the fictional platform."},
			Offers:  []SellerOffer{{SellerName: "Seller", SellerRatingPercent: 98, PriceCents: price, Available: true}},
		}
	}
	cases := []struct {
		name   string
		mutate func(*ProductDetails)
	}{
		{"unsafe cents", func(d *ProductDetails) { d.Offers[0].PriceCents = maxSafeInteger + 1 }},
		{"mismatched From", func(d *ProductDetails) { d.Offers[0].PriceCents++ }},
		{"stock mismatch", func(d *ProductDetails) { d.Offers[0].Available = false }},
		{"blank seller", func(d *ProductDetails) { d.Offers[0].SellerName = " \uFEFF " }},
		{"bidi seller", func(d *ProductDetails) { d.Offers[0].SellerName = "Seller\u202e" }},
		{"bad rating", func(d *ProductDetails) { d.Offers[0].SellerRatingPercent = 101 }},
		{"long description", func(d *ProductDetails) { d.Product.Description = strings.Repeat("x", 5001) }},
		{"missing activation", func(d *ProductDetails) { d.Product.ActivationInstructions = "" }},
		{"invisible activation", func(d *ProductDetails) { d.Product.ActivationInstructions = "\uFEFF\uFEFF" }},
		{"bidi activation", func(d *ProductDetails) { d.Product.ActivationInstructions = "Codes\u202e" }},
		{"long activation", func(d *ProductDetails) { d.Product.ActivationInstructions = strings.Repeat("x", 1001) }},
		{"unsafe cover", func(d *ProductDetails) { d.Product.CoverURL = "/\n/external.example/cover.webp" }},
		{"unknown facet", func(d *ProductDetails) { d.Product.Region = "mars" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := fixture()
			c.mutate(&d)
			if !errors.Is(prepareProductDetails(&d), errInvalidProductData) {
				t.Fatal("invalid product accepted")
			}
		})
	}
	d := fixture()
	if err := prepareProductDetails(&d); err != nil || d.Currency != "EUR" || !d.Product.Available {
		t.Fatalf("valid product rejected: %v", err)
	}
	d = fixture()
	d.Product.LowestPriceCents = nil
	d.Offers = []SellerOffer{}
	if err := prepareProductDetails(&d); err != nil || d.Product.Available {
		t.Fatal("empty offers rejected or invented stock")
	}
}
