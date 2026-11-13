package maintenance

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMigrationTarget(t *testing.T) {
	for _, tt := range []struct {
		name, owner, app string
		valid            bool
	}{
		{"same endpoint", "postgres://owner:private@localhost:5433/eneba_test", "postgres://app:private@localhost:5433/eneba_test", true},
		{"canonical hostname", "postgres://owner@LOCALHOST./eneba_test", "postgres://app@localhost/eneba_test", true},
		{"different database", "postgres://owner@localhost/eneba_test", "postgres://app@localhost/eneba_dev", false},
		{"different server same database name", "postgres://owner@one/postgres", "postgres://app@two/postgres", false},
		{"different port", "postgres://owner@localhost:5433/eneba_test", "postgres://app@localhost:5432/eneba_test", false},
		{"same pooler project", "postgres://postgres.projectA@region.pooler.supabase.com/postgres", "postgres://app.projectA@region.pooler.supabase.com/postgres", true},
		{"different pooler project", "postgres://postgres.projectA@region.pooler.supabase.com/postgres", "postgres://app.projectB@region.pooler.supabase.com/postgres", false},
		{"missing pooler project", "postgres://postgres@region.pooler.supabase.com/postgres", "postgres://app@region.pooler.supabase.com/postgres", false},
		{"host override", "postgres://owner@localhost/eneba_test", "postgres://app@localhost/eneba_test?host=elsewhere", false},
		{"multiple hosts", "postgres://owner@one,two/eneba_test", "postgres://app@one,two/eneba_test", false},
		{"invalid URL", "private", "postgres://app@localhost/eneba_test", false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := validateMigrationTarget(tt.owner, tt.app)
			if (err == nil) != tt.valid {
				t.Fatalf("valid=%v, error=%v", tt.valid, err)
			}
			if err != nil && strings.Contains(err.Error(), "private") {
				t.Fatal("credentials leaked")
			}
		})
	}
}

func TestMigrationRejectsMismatchBeforeConnectingOrReadingFiles(t *testing.T) {
	_, err := Migrate(context.Background(), "postgres://owner@127.0.0.1:1/eneba_test", "postgres://app@127.0.0.1:1/eneba_dev", "missing-directory")
	if err == nil || !strings.Contains(err.Error(), "same endpoint and database") {
		t.Fatalf("preflight did not run first: %v", err)
	}
}

func TestProvisioningRecovery(t *testing.T) {
	const contents = "DATABASE_URL=test-placeholder\n"
	for _, phase := range []string{"roles", "database", "publish", "success"} {
		t.Run(phase, func(t *testing.T) {
			root := t.TempDir()
			recovery := filepath.Join(root, ".env.provisioning.local")
			env := filepath.Join(root, ".env")
			err := provisionWithRecovery(root, contents, func() error {
				data, err := os.ReadFile(recovery)
				if err != nil || string(data) != contents {
					t.Fatal("credentials must be durable before resource creation")
				}
				if _, err := os.Stat(env); !errors.Is(err, os.ErrNotExist) {
					t.Fatal(".env published before provisioning completed")
				}
				if phase == "publish" {
					return os.WriteFile(env, []byte("existing configuration"), 0600)
				}
				if phase != "success" {
					return errors.New("injected provisioning failure")
				}
				return nil
			})
			if phase == "success" {
				if err != nil {
					t.Fatal(err)
				}
				data, err := os.ReadFile(env)
				if err != nil || string(data) != contents {
					t.Fatal("configuration not published")
				}
				if _, err := os.Stat(recovery); !errors.Is(err, os.ErrNotExist) {
					t.Fatal("redundant recovery file remains")
				}
			} else {
				if err == nil {
					t.Fatal("expected failure")
				}
				data, readErr := os.ReadFile(recovery)
				if readErr != nil || string(data) != contents {
					t.Fatal("recovery credentials lost")
				}
				if phase == "publish" {
					data, _ := os.ReadFile(env)
					if string(data) != "existing configuration" {
						t.Fatal("existing configuration overwritten")
					}
				}
			}
		})
	}
}

func TestProvisioningCollisionDoesNotCreateResources(t *testing.T) {
	for _, name := range []string{".env", ".env.provisioning.local"} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			if err := os.WriteFile(filepath.Join(root, name), []byte("preserve"), 0600); err != nil {
				t.Fatal(err)
			}
			err := provisionWithRecovery(root, "replacement", func() error { t.Fatal("must not create resources"); return nil })
			if err == nil {
				t.Fatal("expected collision")
			}
			data, _ := os.ReadFile(filepath.Join(root, name))
			if string(data) != "preserve" {
				t.Fatal("existing configuration changed")
			}
		})
	}
}
