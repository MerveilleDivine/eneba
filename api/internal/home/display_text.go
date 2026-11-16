package home

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// Bound raw source text before checking blank copy. JavaScript trim treats a
// byte-order mark as whitespace too; both ends must agree on required text.
func validHomeText(value string, limit int, required bool) bool {
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) > limit {
		return false
	}
	if required && strings.TrimFunc(value, func(r rune) bool {
		return unicode.IsSpace(r) || r == '\uFEFF'
	}) == "" {
		return false
	}
	for _, r := range value {
		if r < 32 || r == 127 {
			return false
		}
	}
	return true
}
