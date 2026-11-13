package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealthMethods(t *testing.T) {
	mux := http.NewServeMux()
	RegisterHealth(mux, func(context.Context) error { t.Fatal("must not check readiness"); return nil }, slog.Default())
	mux.HandleFunc("/", NotFound)
	for _, path := range []string{"/healthz", "/readyz"} {
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, path, nil))
		if response.Code != 405 || response.Header().Get("Allow") != "GET, HEAD" {
			t.Fatalf("unexpected method response: %d", response.Code)
		}
	}
}

func TestRequestLoggingAndPanicHandling(t *testing.T) {
	for _, phase := range []string{"implicit success", "handled unavailable", "invalid status", "panic before headers", "panic after headers", "panic after flush"} {
		t.Run(phase, func(t *testing.T) {
			var logs bytes.Buffer
			handler := Wrap(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				if phase == "handled unavailable" {
					WriteError(w, 503, "service_unavailable", "Please try again.")
					return
				}
				if phase == "invalid status" {
					w.WriteHeader(99)
					return
				}
				if phase == "panic after flush" {
					_ = http.NewResponseController(w).Flush()
				}
				if phase == "panic after headers" {
					_, _ = w.Write([]byte("partial"))
				}
				if phase != "implicit success" {
					panic("password=private")
				}
			}), slog.New(slog.NewJSONHandler(&logs, nil)))
			response := httptest.NewRecorder()
			var caught any
			func() {
				defer func() { caught = recover() }()
				handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
			}()
			if phase == "panic after headers" || phase == "panic after flush" {
				if caught != http.ErrAbortHandler {
					t.Fatalf("partial response must abort, got %v", caught)
				}
			} else if caught != nil {
				t.Fatalf("unexpected panic: %v", caught)
			}
			want := 200
			if phase == "panic before headers" || phase == "invalid status" {
				want = 500
			}
			if phase == "handled unavailable" {
				want = 503
			}
			if response.Code != want {
				t.Fatalf("status=%d want=%d", response.Code, want)
			}
			lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
			var event struct {
				Status    int    `json:"status"`
				Failed    bool   `json:"failed"`
				RequestID string `json:"request_id"`
			}
			if err := json.Unmarshal([]byte(lines[len(lines)-1]), &event); err != nil {
				t.Fatal(err)
			}
			if event.Status != want || event.Failed != (phase != "implicit success") || event.RequestID != response.Header().Get("X-Request-ID") {
				t.Fatal("incorrect request event")
			}
			if strings.Contains(logs.String()+response.Body.String(), "private") {
				t.Fatal("panic details leaked")
			}
		})
	}
}

func TestJSONEncodingFailureCannotCommitSuccess(t *testing.T) {
	response := httptest.NewRecorder()
	WriteJSON(response, 200, math.NaN())
	if response.Code != 500 || !json.Valid(response.Body.Bytes()) {
		t.Fatal("expected generic JSON error before committing headers")
	}
}
