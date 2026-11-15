package home

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/jackc/pgx/v5/pgconn"
)

func fixtureBanner() Banner {
	return Banner{
		ID:         "50000000-0000-4000-8000-000000000001",
		Headline:   "Discover your next world",
		Subheading: "An unofficial marketplace with fictional games.",
		ImageURL:   "/images/banners/discover-world.svg",
		LinkHref:   "/catalog",
		Position:   0,
	}
}

func TestBannerValidation(t *testing.T) {
	if !validBanner(fixtureBanner()) {
		t.Fatal("valid demo fixture must be accepted")
	}
	for _, tt := range []struct {
		name   string
		change func(*Banner)
	}{
		{"empty headline", func(b *Banner) { b.Headline = "  " }},
		{"too long headline", func(b *Banner) { b.Headline = strings.Repeat("a", 121) }},
		{"too long subheading", func(b *Banner) { b.Subheading = strings.Repeat("a", 241) }},
		{"negative position", func(b *Banner) { b.Position = -1 }},
		{"missing identifier", func(b *Banner) { b.ID = "" }},
		{"old route", func(b *Banner) { b.LinkHref = "/store" }},
		{"external redirect", func(b *Banner) { b.LinkHref = "https://example.com" }},
		{"protocol-relative redirect", func(b *Banner) { b.LinkHref = "//example.com" }},
		{"encoded path", func(b *Banner) { b.LinkHref = "/catalog%2felse" }},
		{"unsafe query", func(b *Banner) { b.LinkHref = "/catalog?q=safe&pageSize=900" }},
		{"duplicate query", func(b *Banner) { b.LinkHref = "/catalog?q=a&q=b" }},
		{"fragment", func(b *Banner) { b.LinkHref = "/catalog?q=solar#private" }},
		{"unsafe image", func(b *Banner) { b.ImageURL = "javascript:alert(1)" }},
		{"encoded image", func(b *Banner) { b.ImageURL = "/images/banners/%2e%2e.svg" }},
		{"path traversal", func(b *Banner) { b.ImageURL = "/images/banners/../private.svg" }},
		{"remote image", func(b *Banner) { b.ImageURL = "https://example.com/banner.svg" }},
	} {
		t.Run(tt.name, func(t *testing.T) {
			banner := fixtureBanner()
			tt.change(&banner)
			if validBanner(banner) {
				t.Fatalf("invalid banner accepted: %+v", banner)
			}
		})
	}
	for _, href := range []string{"/", "/catalog", "/catalog?q=solar", "/catalog?platform=steam&region=global"} {
		banner := fixtureBanner()
		banner.LinkHref = href
		if !validBanner(banner) {
			t.Fatalf("valid internal link rejected: %q", href)
		}
	}
}

func TestBannerReadErrors(t *testing.T) {
	for _, err := range []error{context.Canceled, context.DeadlineExceeded,
		&pgconn.PgError{Code: "08006"}, &pgconn.PgError{Code: "53300"},
		&pgconn.PgError{Code: "57P01"}} {
		if !errors.Is(database.ClassifyReadError(err), database.ErrUnavailable) {
			t.Fatalf("operational error should be unavailable: %v", err)
		}
	}
	if errors.Is(database.ClassifyReadError(&pgconn.PgError{Code: "42P01"}), database.ErrUnavailable) {
		t.Fatal("SQL bugs must remain internal failures")
	}
}
