//go:build integration

package auth

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database"
)

func TestSessionCapInvalidatesOldestTokens(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	endpoint, err := url.Parse(dsn)
	if err != nil || endpoint.Hostname() == "" || endpoint.Path != "/eneba_test" {
		t.Fatal("session cap integration test requires isolated eneba_test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := database.OpenPool(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	repository := NewRepository(pool)
	service := NewService(repository)
	email := fmt.Sprintf("session-cap-%d@example.test", time.Now().UnixNano())
	user, originalToken, err := service.Register(ctx, "Session Cap Buyer", email, "unique password 123")
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanupCtx, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		if _, cleanupErr := pool.Exec(cleanupCtx, "DELETE FROM marketplace.users WHERE id=$1", user.ID); cleanupErr != nil {
			t.Errorf("session cap fixture cleanup: %v", cleanupErr)
		}
	}()

	initialDigest, ok := tokenDigest(originalToken)
	if !ok {
		t.Fatal("invalid initial session token")
	}
	digests := [][]byte{initialDigest}
	for i := 0; i < 7; i++ {
		_, digest, tokenErr := sessionToken()
		if tokenErr != nil {
			t.Fatal(tokenErr)
		}
		if err := repository.CreateSession(ctx, user.ID, digest, time.Now().Add(sessionLifetime)); err != nil {
			t.Fatal(err)
		}
		digests = append(digests, digest)
		// Separate transaction timestamps rather than relying on random UUID
		// order when checking which sessions must be retained.
		time.Sleep(2 * time.Millisecond)
	}

	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM marketplace.sessions WHERE user_id=$1", user.ID).Scan(&count); err != nil || count != 5 {
		t.Fatalf("expected five retained sessions, got %d: %v", count, err)
	}
	for i, digest := range digests {
		_, err := repository.FindSession(ctx, digest)
		if i < len(digests)-5 && !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("old session %d was not invalidated: %v", i, err)
		}
		if i >= len(digests)-5 && err != nil {
			t.Fatalf("new session %d was invalidated: %v", i, err)
		}
	}
}
