package purchase

import "testing"

func TestOrderPagination(t *testing.T) {
	for _, query := range []string{"page=0", "page=-1", "page=+1", "pageSize=0", "pageSize=51", "page=1&page=2", "buyer=x", "page=", "page=%20", "page=%zz", "page=9007199254740992", "page=9223372036854775807&pageSize=50"} {
		if _, err := parseOrderPagination(query); err == nil {
			t.Errorf("accepted %q", query)
		}
	}
	for _, test := range []struct {
		query              string
		page, size, offset int64
	}{
		{"", 1, 20, 0}, {"page=3&pageSize=2", 3, 2, 4}, {"pageSize=50", 1, 50, 0},
	} {
		got, err := parseOrderPagination(test.query)
		if err != nil || got.page != test.page || got.size != test.size || got.offset != test.offset {
			t.Errorf("%q: %+v, %v", test.query, got, err)
		}
	}
}
