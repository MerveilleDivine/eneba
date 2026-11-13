package httpapi

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealthEndpoints(t *testing.T) {
	tests := []struct {
		name        string
		path        string
		checkError  error
		code        int
		status      string
		checkCalled bool
	}{
		{"liveness ignores database", "/healthz", errors.New("password=private"), 200, "ok", false},
		{"ready", "/readyz", nil, 200, "ready", true},
		{"unavailable", "/readyz", errors.New("password=private"), 503, "not_ready", true},
		{"unknown route", "/api/v1/products", nil, 404, "not_found", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer
			called := false
			mux := http.NewServeMux()
			logger := slog.New(slog.NewJSONHandler(&logs, nil))
			RegisterHealth(mux, func(ctx context.Context) error {
				called = true
				if _, ok := ctx.Deadline(); !ok {
					t.Error("readiness check needs a deadline")
				}
				return tt.checkError
			}, logger)
			mux.HandleFunc("/", NotFound)
			handler := Wrap(mux, logger)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, tt.path, nil))
			if response.Code != tt.code || !strings.Contains(response.Body.String(), tt.status) {
				t.Fatalf("unexpected response: %d %s", response.Code, response.Body.String())
			}
			if called != tt.checkCalled {
				t.Fatalf("database check called=%v", called)
			}
			if response.Header().Get("X-Request-ID") == "" || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("missing trace or cache headers")
			}
			if strings.Contains(response.Body.String()+logs.String(), "private") {
				t.Fatal("database details leaked")
			}
		})
	}
}
