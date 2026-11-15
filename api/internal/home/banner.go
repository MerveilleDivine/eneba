// Package home owns independently sourced marketplace homepage sections.
package home

import (
	"context"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/MerveilleDivine/eneba/api/internal/catalog"
)

const (
	maxBanners           = 3
	bannerCandidateLimit = 12
	maxBannerLinkLength  = 2048
	maxBannerImageLength = 400
	maxBannerHeadline    = 120
	maxBannerSubheading  = 240
)

var bannerImagePattern = regexp.MustCompile(`^/images/banners/[a-z0-9][a-z0-9_-]*[.](?:webp|svg)$`)

type Banner struct {
	ID         string `json:"id"`
	Headline   string `json:"headline"`
	Subheading string `json:"subheading"`
	ImageURL   string `json:"imageUrl"`
	LinkHref   string `json:"linkHref"`
	Position   int32  `json:"position"`
}

type BannerPage struct {
	Items []Banner `json:"items"`
}

// BannerRejection contains only a database UUID and a fixed safe error category.
type BannerRejection struct {
	ID     string
	Reason string
}

type BannerService struct {
	repository *BannerRepository
}

func NewBannerService(repository *BannerRepository) *BannerService {
	return &BannerService{repository: repository}
}

// Bounded candidate selection allows the next valid banner to replace a
// malformed earlier banner. At most three validated records reach the client.
func (s *BannerService) List(ctx context.Context) (BannerPage, []BannerRejection, error) {
	banners, err := s.repository.List(ctx)
	if err != nil {
		return BannerPage{}, nil, err
	}
	page := BannerPage{Items: make([]Banner, 0, maxBanners)}
	rejected := make([]BannerRejection, 0)
	for _, banner := range banners {
		if reason := invalidBannerReason(banner); reason != "" {
			rejected = append(rejected, BannerRejection{ID: banner.ID, Reason: reason})
			continue
		}
		page.Items = append(page.Items, banner)
		if len(page.Items) == maxBanners {
			break
		}
	}
	return page, rejected, nil
}

func validBanner(banner Banner) bool {
	return invalidBannerReason(banner) == ""
}

// Reject raw oversized text rather than trimming away potentially enormous
// padding. The reason is a stable category without source text.
func invalidBannerReason(banner Banner) string {
	if banner.ID == "" || banner.Position < 0 {
		return "invalid_identity_or_position"
	}
	if !validBannerText(banner.Headline, maxBannerHeadline, true) {
		return "invalid_headline"
	}
	if !validBannerText(banner.Subheading, maxBannerSubheading, false) {
		return "invalid_subheading"
	}
	if !validBannerImage(banner.ImageURL) {
		return "invalid_image"
	}
	if !validBannerLink(banner.LinkHref) {
		return "invalid_destination"
	}
	return ""
}

func validBannerText(value string, limit int, required bool) bool {
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) > limit ||
		(required && strings.TrimSpace(value) == "") {
		return false
	}
	for _, r := range value {
		if r < 32 || r == 127 {
			return false
		}
	}
	return true
}

func validBannerImage(value string) bool {
	return len(value) <= maxBannerImageLength && bannerImagePattern.MatchString(value)
}

func validBannerLink(value string) bool {
	// Until product detail exists, every promotional CTA must lead somewhere
	// useful: the existing catalog, optionally with valid filters.
	if value == "/catalog" {
		return true
	}
	if len(value) > maxBannerLinkLength || !strings.HasPrefix(value, "/catalog?") {
		return false
	}
	for _, r := range value {
		if r < 32 || r == 35 || r == 92 || r == 127 {
			return false
		}
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "" || parsed.Host != "" ||
		parsed.Opaque != "" || parsed.Fragment != "" || parsed.RawPath != "" ||
		parsed.Path != "/catalog" || parsed.RawQuery == "" ||
		parsed.EscapedPath() != "/catalog" {
		return false
	}
	return catalog.ValidLinkQuery(parsed.RawQuery)
}
