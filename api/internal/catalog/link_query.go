package catalog

// ValidLinkQuery applies the same parser and domain validation as the catalog
// endpoint to promotional links. This prevents homepage links from encoding
// unsupported filters while keeping catalog query rules in one owner.
func ValidLinkQuery(rawQuery string) bool {
	filter, err := parseFilter(rawQuery)
	if err != nil {
		return false
	}
	_, err = normalizeFilter(filter)
	return err == nil
}
