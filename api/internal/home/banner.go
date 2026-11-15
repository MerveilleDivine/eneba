// Package home owns independently sourced marketplace homepage sections.
package home

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/MerveilleDivine/eneba/api/internal/catalog"
)

var errInvalidBanner = errors.New("invalid stored homepage banner")

const maxBanners = 3

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

type BannerService struct {
	repository *BannerRepository
}

func NewBannerService(repository *BannerRepository) *BannerService {
	return &BannerService{repository: repository}
}

func (s *BannerService) List(ctx context.Context) (BannerPage, error) {
	banners, err := s.repository.List(ctx)
	if err != nil {
		return BannerPage{}, err
	}
	for _, banner := range banners {
		if !validBanner(banner) {
			return BannerPage{}, errInvalidBanner
		}
	}
	return BannerPage{Items: banners}, nil
}

func validBanner(banner Banner) bool {
	if banner.ID == "" || banner.Position < 0 {
		return false
	}
	headline := strings.TrimSpace(banner.Headline)
	subheading := strings.TrimSpace(banner.Subheading)
	if !utf8.ValidString(headline) || !utf8.ValidString(subheading) {
		return false
	}
	if n := utf8.RuneCountInString(headline); n < 1 || n > 120 {
		return false
	}
	if utf8.RuneCountInString(subheading) > 240 {
		return false
	}
	return validBannerImage(banner.ImageURL) && validBannerLink(banner.LinkHref)
}

func validBannerImage(value string) bool {
	if len(value) > 400 || !strings.HasPrefix(value, "/images/banners/") ||
		strings.Contains(value, "..") || strings.Contains(value, "//") {
		return false
	}
	name := strings.TrimPrefix(value, "/images/banners/")
	if name == "" || !(strings.HasSuffix(name, ".webp") || strings.HasSuffix(name, ".svg")) {
		return false
	}
	for _, letter := range name {
		if (letter < 'a' || letter > 'z') && (letter < '0' || letter > '9') &&
			letter != '.' && letter != '_' && letter != '-' && letter != '/' {
			return false
		}
	}
	return true
}

func validBannerLink(value string) bool {
	if value == "/" || value == "/catalog" {
		return true
	}
	if !strings.HasPrefix(value, "/catalog?") {
		return false
	}
	for _, r := range value {
		if r < 32 || r == 35 || r == 92 {
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
