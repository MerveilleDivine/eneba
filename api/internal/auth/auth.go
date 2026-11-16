package auth

import (
	"context"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	passwordIterations = 600000
	sessionLifetime    = 7 * 24 * time.Hour
	maxAttempts        = 6
	attemptWindow      = 15 * time.Minute
	maxTrackedAccounts = 4096
)

var (
	ErrInvalidInput = errors.New("invalid account details")
	ErrEmailTaken   = errors.New("email already registered")
	ErrUnauthorized = errors.New("unauthorized")
	ErrRateLimited  = errors.New("too many sign-in attempts")
)

// User is the complete public account projection. No hashes or session IDs.
type User struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
}

// Store isolates authentication SQL from credential and policy decisions.
type Store interface {
	CreateAccount(context.Context, User, string, []byte, time.Time) (User, error)
	FindPassword(context.Context, string) (User, string, error)
	CreateSession(context.Context, string, []byte, time.Time) error
	FindSession(context.Context, []byte) (User, error)
	DeleteSession(context.Context, []byte) error
}

type attempts struct {
	count int
	until time.Time
}

type Service struct {
	store   Store
	mu      sync.Mutex
	failed  map[[32]byte]attempts
	now     func() time.Time
}

func NewService(store Store) *Service {
	return &Service{
		store:   store,
		failed:  make(map[[32]byte]attempts),
		now:     time.Now,
	}
}

func normalizeEmail(input string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(input))
	if len(email) < 5 || len(email) > 254 || !utf8.ValidString(email) ||
		strings.ContainsAny(email, " \t\r\n<>\"'\\") || strings.Count(email, "@") != 1 {
		return "", ErrInvalidInput
	}
	local, domain, ok := strings.Cut(email, "@")
	if !ok || len(local) == 0 || len(local) > 64 || len(domain) < 3 ||
		!strings.Contains(domain, ".") || strings.HasPrefix(domain, ".") ||
		strings.HasSuffix(domain, ".") || strings.Contains(domain, "..") {
		return "", ErrInvalidInput
	}
	for _, r := range email {
		if r < 33 || r > 126 {
			return "", ErrInvalidInput
		}
	}
	return email, nil
}

func normalizeName(input string) (string, error) {
	name := strings.TrimFunc(input, func(r rune) bool {
		return unicode.IsSpace(r) || r == '\uFEFF'
	})
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) == 0 ||
		utf8.RuneCountInString(name) > 80 {
		return "", ErrInvalidInput
	}
	for _, r := range name {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			return "", ErrInvalidInput
		}
	}
	return name, nil
}

func validPassword(password string) bool {
	return len(password) >= 12 && len(password) <= 128 &&
		utf8.ValidString(password) && !strings.ContainsRune(password, '\x00')
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, passwordIterations, 32)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("pbkdf2-sha256$%d$%s$%s", passwordIterations,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

func matchPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" {
		return false
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations != passwordIterations {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[2])
	if err != nil || len(salt) != 16 {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil || len(expected) != 32 {
		return false
	}
	actual, err := pbkdf2.Key(sha256.New, password, salt, iterations, 32)
	return err == nil && subtle.ConstantTimeCompare(expected, actual) == 1
}

func sessionToken() (string, []byte, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	digest := sha256.Sum256(raw)
	return token, digest[:], nil
}

func tokenDigest(token string) ([]byte, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(raw) != 32 || base64.RawURLEncoding.EncodeToString(raw) != token {
		return nil, false
	}
	digest := sha256.Sum256(raw)
	return digest[:], true
}

func (s *Service) Register(ctx context.Context, name, email, password string) (User, string, error) {
	var err error
	email, err = normalizeEmail(email)
	if err != nil {
		return User{}, "", err
	}
	name, err = normalizeName(name)
	if err != nil || !validPassword(password) {
		return User{}, "", ErrInvalidInput
	}
	encoded, err := hashPassword(password)
	if err != nil {
		return User{}, "", err
	}
	token, digest, err := sessionToken()
	if err != nil {
		return User{}, "", err
	}
	user, err := s.store.CreateAccount(ctx,
		User{Email: email, DisplayName: name}, encoded, digest, s.now().Add(sessionLifetime))
	if err != nil {
		return User{}, "", err
	}
	return user, token, nil
}

// Both limiter operations run under the same lock. The map is deliberately
// bounded; new identities fail closed at capacity while existing identities
// continue accumulating failures.
func (s *Service) pruneExpiredLocked(now time.Time) {
	for key, state := range s.failed {
		if !now.Before(state.until) {
			delete(s.failed, key)
		}
	}
}

func (s *Service) isBlocked(email string) bool {
	key := sha256.Sum256([]byte(email))
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	s.pruneExpiredLocked(now)
	state, exists := s.failed[key]
	return (exists && state.count >= maxAttempts) ||
		(!exists && len(s.failed) >= maxTrackedAccounts)
}

func (s *Service) markFailure(email string) {
	key := sha256.Sum256([]byte(email))
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	s.pruneExpiredLocked(now)
	state, exists := s.failed[key]
	if !exists && len(s.failed) >= maxTrackedAccounts {
		return
	}
	if !now.Before(state.until) {
		state = attempts{until: now.Add(attemptWindow)}
	}
	state.count++
	s.failed[key] = state
}

func (s *Service) clearFailures(email string) {
	key := sha256.Sum256([]byte(email))
	s.mu.Lock()
	delete(s.failed, key)
	s.mu.Unlock()
}

func (s *Service) Login(ctx context.Context, email, password string) (User, string, error) {
	var err error
	email, err = normalizeEmail(email)
	if err != nil || !validPassword(password) {
		return User{}, "", ErrUnauthorized
	}
	if s.isBlocked(email) {
		return User{}, "", ErrRateLimited
	}
	user, stored, lookupErr := s.store.FindPassword(ctx, email)
	if errors.Is(lookupErr, ErrUnauthorized) {
		// Missing accounts perform the same cost of password derivation.
		_, _ = pbkdf2.Key(sha256.New, password, make([]byte, 16), passwordIterations, 32)
		s.markFailure(email)
		return User{}, "", ErrUnauthorized
	}
	if lookupErr != nil {
		return User{}, "", lookupErr
	}
	if !matchPassword(password, stored) {
		s.markFailure(email)
		return User{}, "", ErrUnauthorized
	}
	token, digest, err := sessionToken()
	if err != nil {
		return User{}, "", err
	}
	if err := s.store.CreateSession(ctx, user.ID, digest, s.now().Add(sessionLifetime)); err != nil {
		return User{}, "", err
	}
	s.clearFailures(email)
	return user, token, nil
}

func (s *Service) Current(ctx context.Context, token string) (User, error) {
	digest, valid := tokenDigest(token)
	if !valid {
		return User{}, ErrUnauthorized
	}
	return s.store.FindSession(ctx, digest)
}

func (s *Service) Logout(ctx context.Context, token string) error {
	digest, valid := tokenDigest(token)
	if !valid {
		return nil
	}
	return s.store.DeleteSession(ctx, digest)
}
