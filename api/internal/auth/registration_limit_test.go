package auth

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestRegistrationQuotaConcurrentAndWindowReset(t *testing.T) {
	service := NewService(&fakeStore{})
	now := time.Date(2026, time.November, 16, 9, 0, 0, 0, time.UTC)
	service.now = func() time.Time { return now }

	var admitted atomic.Int32
	var workers sync.WaitGroup
	for i := 0; i < maxRegistrationsPerMinute+20; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			if service.allowRegistration() {
				admitted.Add(1)
			}
		}()
	}
	workers.Wait()
	if got := admitted.Load(); got != maxRegistrationsPerMinute {
		t.Fatalf("registration cap is not atomic: got %d, want %d", got, maxRegistrationsPerMinute)
	}
	if _, _, err := service.Register(context.Background(), "Demo Buyer", "demo@example.test", "unique password 123"); !errors.Is(err, ErrRegistrationLimited) {
		t.Fatalf("registration was not rejected before hashing at capacity: %v", err)
	}
	now = now.Add(registrationWindow)
	if _, _, err := service.Register(context.Background(), "Demo Buyer", "demo@example.test", "unique password 123"); err != nil {
		t.Fatalf("registration failed after the window reset: %v", err)
	}
}

func TestInvalidRegistrationDoesNotConsumeQuota(t *testing.T) {
	service := NewService(&fakeStore{})
	if _, _, err := service.Register(context.Background(), "", "demo@example.test", "unique password 123"); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected invalid account details: %v", err)
	}
	if service.registrationCount != 0 {
		t.Fatal("invalid registration consumed costly-hash quota")
	}
}
