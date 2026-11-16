package auth

import (
	"context"
	"crypto/sha256"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

type fakeStore struct {
	user User
	password string
	sessionHash []byte
	expires time.Time
}
func (f *fakeStore) CreateAccount(_ context.Context, user User, hash string, digest []byte, expiry time.Time) (User,error) {
	f.user = user
	f.user.ID = "00000000-0000-4000-8000-000000000001"
	f.password = hash
	f.sessionHash = append([]byte(nil),digest...)
	f.expires = expiry
	return f.user,nil
}
func (f *fakeStore) FindPassword(_ context.Context, email string) (User,string,error) {
	if f.user.Email != email { return User{},"",ErrUnauthorized }
	return f.user,f.password,nil
}
func (f *fakeStore) CreateSession(_ context.Context, _ string, digest []byte, expiry time.Time) error {
	f.sessionHash = append([]byte(nil),digest...)
	f.expires = expiry
	return nil
}
func (f *fakeStore) FindSession(_ context.Context,digest []byte) (User,error) {
	if string(f.sessionHash)!=string(digest) { return User{},ErrUnauthorized }
	return f.user,nil
}
func (f *fakeStore) DeleteSession(_ context.Context,digest []byte) error {
	if string(f.sessionHash)==string(digest) { f.sessionHash = nil }
	return nil
}
func TestCredentialRulesAndSessions(t *testing.T) {
	for _, email := range []string{"", "bad", "test@@example.com", "a@localhost", "a@\nexample.com"} {
		if _,err := normalizeEmail(email); !errors.Is(err,ErrInvalidInput) { t.Fatalf("accepted invalid email %q",email) }
	}
	if normalized,err := normalizeEmail(" Test@Example.COM "); err != nil || normalized!="test@example.com" { t.Fatal("email normalization") }
	if _,err := normalizeName("\u202e"); !errors.Is(err,ErrInvalidInput) { t.Fatal("bidi name accepted") }
	for _, name := range []string{"\uFEFF", "\u200e", "\u200b", "\u2060", "Valid\uFEFFName", "Name\u202e"} {
		if _, err := normalizeName(name); !errors.Is(err, ErrInvalidInput) { t.Fatalf("accepted unsafe name %q", name) }
	}
	if validPassword("short") || !validPassword("very secure password 123") { t.Fatal("password bounds") }
	store := &fakeStore{}
	svc := NewService(store)
	now := time.Date(2026,11,16,8,0,0,0,time.UTC)
	svc.now = func() time.Time { return now }
	user,token,err := svc.Register(context.Background()," Test Person ","TEST@example.com","very secure password 123")
	if err!=nil || user.Email!="test@example.com" || user.DisplayName!="Test Person" { t.Fatalf("register: %+v %v",user,err) }
	if store.password == "very secure password 123" || !matchPassword("very secure password 123",store.password) || matchPassword("wrong password",store.password) { t.Fatal("password verifier") }
	digest,valid := tokenDigest(token)
	if !valid || len(digest)!=32 || len(token)!=43 || string(digest)!=string(store.sessionHash) { t.Fatal("session token not stored as digest") }
	if store.expires != now.Add(sessionLifetime) { t.Fatal("wrong session expiry") }
	if _,err = svc.Current(context.Background(),token); err!=nil { t.Fatal(err) }
	if _,err = svc.Current(context.Background(),"invalid"); !errors.Is(err,ErrUnauthorized) { t.Fatal("invalid cookie accepted") }
	if err = svc.Logout(context.Background(),token); err!=nil { t.Fatal(err) }
	if _,err = svc.Current(context.Background(),token); !errors.Is(err,ErrUnauthorized) { t.Fatal("revoked cookie works") }
}
func TestLoginAndThrottling(t *testing.T) {
	store:=&fakeStore{}
	svc:=NewService(store)
	_,_,err:=svc.Register(context.Background(),"Person","user@example.com","correct password 123")
	if err!=nil { t.Fatal(err) }
	_,token,err:=svc.Login(context.Background(),"USER@example.com","correct password 123")
	if err!=nil || token=="" { t.Fatal("correct password rejected",err) }
	for i:=0;i<maxAttempts;i++ {
		_,_,err=svc.Login(context.Background(),"user@example.com","incorrect-password")
		if !errors.Is(err,ErrUnauthorized) { t.Fatal("wrong password allowed",err) }
	}
	_,_,err=svc.Login(context.Background(),"user@example.com","correct password 123")
	if !errors.Is(err,ErrRateLimited) { t.Fatal("rate limit bypassed",err) }
}

func TestLoginFailureCounterAtCapacity(t *testing.T) {
	svc := NewService(&fakeStore{})
	now := time.Now()
	svc.now = func() time.Time { return now }
	email := "known@example.com"
	target := sha256.Sum256([]byte(email))
	svc.failed[target] = attempts{count: 1, until: now.Add(attemptWindow)}
	for i := 0; len(svc.failed) < 4096; i++ {
		key := sha256.Sum256([]byte("random-" + strconv.Itoa(i)))
		if key != target { svc.failed[key] = attempts{count: 1, until: now.Add(attemptWindow)} }
	}
	svc.markFailure(email)
	if got := svc.failed[target].count; got != 2 { t.Fatalf("existing identity was no longer throttled at capacity: %d", got) }
	if !svc.isBlocked("new@example.com") { t.Fatal("unknown identities were allowed at capacity") }
}

func TestProductionCookieFlags(t *testing.T) {
	handler := NewHandler(nil, slog.Default(), "https://marketplace.example", true)
	writer := httptest.NewRecorder()
	handler.setCookie(writer, strings.Repeat("a", 43), time.Now().Add(sessionLifetime))
	result := writer.Result()
	defer result.Body.Close()
	cookies := result.Cookies()
	if len(cookies) != 1 { t.Fatal("missing session cookie") }
	c := cookies[0]
	if c.Name != "__Host-eneba_session" || !c.Secure || !c.HttpOnly ||
		c.Path != "/" || c.Domain != "" || c.SameSite != http.SameSiteLaxMode {
		t.Fatalf("unsafe production session cookie: %+v", c)
	}
	clear := httptest.NewRecorder()
	handler.clearCookie(clear)
	gone := clear.Result().Cookies()
	if len(gone) != 1 || gone[0].Name != "__Host-eneba_session" || gone[0].MaxAge >= 0 || !gone[0].Secure {
		t.Fatal("logout did not securely clear the host-only session cookie")
	}
}
