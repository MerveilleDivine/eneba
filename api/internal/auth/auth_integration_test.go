//go:build integration

package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
)

func TestAuthHTTPAndDatabase(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	parsed, err := url.Parse(dsn)
	if err != nil || parsed.Path != "/eneba_test" || parsed.Hostname() == "" {
		t.Fatal("auth integration tests require isolated eneba_test")
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
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := NewHandler(service, logger, "http://127.0.0.1:5173", false)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)
	server := httptest.NewServer(httpapi.Wrap(mux, logger))
	defer server.Close()

	email := fmt.Sprintf("slice5-%d@example.test", time.Now().UnixNano())
	defer func() {
		c, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		if _, e := pool.Exec(c, "DELETE FROM marketplace.users WHERE email=$1", email); e != nil {
			t.Errorf("auth fixture cleanup: %v", e)
		}
	}()

	request := func(method, path, body string, cookie *http.Cookie, origin string) (int, []byte, *http.Cookie) {
		t.Helper()
		req, err := http.NewRequest(method, server.URL+path, bytes.NewBufferString(body))
		if err != nil {
			t.Fatal(err)
		}
		if method == "POST" {
			req.Header.Set("Content-Type", "application/json")
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		data, err := io.ReadAll(res.Body)
		if err != nil {
			t.Fatal(err)
		}
		var session *http.Cookie
		for _, c := range res.Cookies() {
			if c.Name == "eneba_session" {
				session = c
			}
		}
		return res.StatusCode, data, session
	}

	for _, path := range []string{"/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/logout"} {
		if status, _, _ := request("POST", path, "{}", nil, "https://attacker.example"); status != http.StatusForbidden {
			t.Fatalf("%s accepted foreign Origin", path)
		}
		if status, _, _ := request("POST", path, "{}", nil, ""); status != http.StatusForbidden {
			t.Fatalf("%s accepted missing Origin", path)
		}
	}
	if status, _, _ := request("GET", "/api/v1/auth/login", "", nil, ""); status != http.StatusMethodNotAllowed {
		t.Fatalf("login wrong-method response=%d", status)
	}
	if status, _, _ := request("POST", "/api/v1/auth/login", "{", nil, "http://127.0.0.1:5173"); status != http.StatusBadRequest {
		t.Fatalf("malformed JSON accepted, status=%d", status)
	}
	if status, _, _ := request("POST", "/api/v1/auth/register", strings.Repeat("x", 5000), nil, "http://127.0.0.1:5173"); status != http.StatusBadRequest {
		t.Fatalf("oversized JSON accepted, status=%d", status)
	}

	payload, _ := json.Marshal(map[string]string{"displayName": "Demo Buyer", "email": email, "password": "correct password 123"})
	status, data, cookie := request("POST", "/api/v1/auth/register", string(payload), nil, "http://127.0.0.1:5173")
	if status != http.StatusCreated || cookie == nil || !cookie.HttpOnly || cookie.Secure || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" {
		t.Fatalf("registration status=%d cookie=%+v body=%s", status, cookie, data)
	}
	if strings.Contains(string(data), "password") || strings.Contains(string(data), cookie.Value) {
		t.Fatal("credentials leaked in JSON")
	}

	var hash string
	var tokenHash []byte
	err = pool.QueryRow(ctx, "SELECT u.password_hash,s.token_hash FROM marketplace.users u JOIN marketplace.sessions s ON s.user_id=u.id WHERE u.email=$1", email).Scan(&hash, &tokenHash)
	if err != nil || hash == "correct password 123" || len(tokenHash) != 32 || strings.Contains(hash, "correct password") {
		t.Fatal("secret material stored in plaintext", err)
	}
	if n, _, _ := request("GET", "/api/v1/auth/me", "", cookie, ""); n != http.StatusOK {
		t.Fatal("session not persisted")
	}
	if n, _, _ := request("GET", "/api/v1/auth/me", "", nil, ""); n != http.StatusUnauthorized {
		t.Fatal("anonymous me not protected")
	}
	if n, _, _ := request("POST", "/api/v1/auth/logout", "", cookie, "https://attacker.example"); n != http.StatusForbidden {
		t.Fatal("cross-origin logout accepted")
	}
	if n, _, _ := request("POST", "/api/v1/auth/register", string(payload), nil, "http://127.0.0.1:5173"); n != http.StatusConflict {
		t.Fatal("duplicate email accepted")
	}

	bad, _ := json.Marshal(map[string]string{"email": email, "password": "incorrect password"})
	if n, _, _ := request("POST", "/api/v1/auth/login", string(bad), nil, "http://127.0.0.1:5173"); n != http.StatusUnauthorized {
		t.Fatal("incorrect password accepted")
	}
	good, _ := json.Marshal(map[string]string{"email": email, "password": "correct password 123"})
	n, _, fresh := request("POST", "/api/v1/auth/login", string(good), nil, "http://127.0.0.1:5173")
	if n != http.StatusOK || fresh == nil || fresh.Value == cookie.Value {
		t.Fatal("login did not rotate session")
	}
	if n, _, _ := request("POST", "/api/v1/auth/logout", "", cookie, "http://127.0.0.1:5173"); n != http.StatusNoContent {
		t.Fatal("logout rejected")
	}
	if n, _, _ := request("GET", "/api/v1/auth/me", "", cookie, ""); n != http.StatusUnauthorized {
		t.Fatal("logged out session remains valid")
	}
	if n, _, _ := request("GET", "/api/v1/auth/me", "", fresh, ""); n != http.StatusOK {
		t.Fatal("other session invalidated")
	}
	if n, _, _ := request("POST", "/api/v1/auth/logout", "", fresh, "http://127.0.0.1:5173"); n != http.StatusNoContent {
		t.Fatal("second logout rejected")
	}

	// The limiter must produce a 429 before the registration path hashes a
	// password or contacts PostgreSQL; saturation is injected deterministically.
	service.mu.Lock()
	service.registrationStarted = service.now()
	service.registrationCount = maxRegistrationsPerMinute
	service.mu.Unlock()
	if n, _, _ := request("POST", "/api/v1/auth/register", string(payload), nil, "http://127.0.0.1:5173"); n != http.StatusTooManyRequests {
		t.Fatalf("registration limiter did not return 429; status=%d", n)
	}
}
