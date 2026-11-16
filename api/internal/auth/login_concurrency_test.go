package auth

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestConcurrentLoginAttemptsRespectFailureLimit(t *testing.T) {
	service := NewService(&fakeStore{})
	if _, _, err := service.Register(context.Background(), "Demo Buyer", "concurrent@example.test", "correct password 123"); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	const additionalAttempts = 4
	const attempts = maxAttempts + additionalAttempts
	results := make(chan error, attempts)
	var workers sync.WaitGroup
	for i := 0; i < attempts; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			_, _, err := service.Login(ctx, "concurrent@example.test", "incorrect-password")
			results <- err
		}()
	}
	workers.Wait()
	close(results)
	var invalid, limited int
	for err := range results {
		switch {
		case errors.Is(err, ErrUnauthorized):
			invalid++
		case errors.Is(err, ErrRateLimited):
			limited++
		default:
			t.Fatalf("unexpected concurrent login result: %v", err)
		}
	}
	if invalid != maxAttempts || limited != additionalAttempts {
		t.Fatalf("concurrent attempts bypassed the cap: invalid=%d limited=%d", invalid, limited)
	}
}
