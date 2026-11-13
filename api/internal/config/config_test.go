package config

import (
	"strings"
	"testing"
)

func TestLoad(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		ok   bool
	}{
		{"defaults", map[string]string{"DATABASE_URL": "postgres://app:private@localhost/eneba_dev"}, true},
		{"production", map[string]string{"APP_ENV": "production", "PORT": "10000", "DATABASE_URL": "postgresql://app:private@localhost/eneba_dev"}, true},
		{"missing database", map[string]string{}, false},
		{"invalid port", map[string]string{"PORT": "0", "DATABASE_URL": "postgres://app:private@localhost/eneba_dev"}, false},
		{"invalid environment", map[string]string{"APP_ENV": "prod", "DATABASE_URL": "postgres://app:private@localhost/eneba_dev"}, false},
		{"wrong scheme", map[string]string{"DATABASE_URL": "https://app:private@localhost/eneba_dev"}, false},
		{"malformed secret", map[string]string{"DATABASE_URL": "postgres://app:private%zz@localhost/eneba_dev"}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := Load(func(key string) string { return tt.env[key] })
			if (err == nil) != tt.ok {
				t.Fatalf("unexpected result: cfg=%+v err=%v", Config{Environment: cfg.Environment, Port: cfg.Port}, err)
			}
			if err != nil && strings.Contains(err.Error(), "private") {
				t.Fatal("configuration error exposed a credential")
			}
			if tt.name == "defaults" && (cfg.Port != "8080" || cfg.Environment != "development") {
				t.Fatal("defaults were not applied")
			}
		})
	}
}
