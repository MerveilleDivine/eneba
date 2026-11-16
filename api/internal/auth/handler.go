package auth

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
)

type Handler struct {
	service *Service
	logger  *slog.Logger
	origin  string
	secure  bool
}

func NewHandler(service *Service, logger *slog.Logger, origin string, secure bool) *Handler {
	return &Handler{service: service, logger: logger, origin: origin, secure: secure}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	registerPOST(mux, "/api/v1/auth/register", h.register)
	registerPOST(mux, "/api/v1/auth/login", h.login)
	registerPOST(mux, "/api/v1/auth/logout", h.logout)
	httpapi.HandleGET(mux, "/api/v1/auth/me", h.me)
}

func registerPOST(mux *http.ServeMux, path string, handler http.HandlerFunc) {
	mux.HandleFunc("POST "+path, handler)
	mux.HandleFunc(path, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Allow", "POST")
		httpapi.WriteError(w, http.StatusMethodNotAllowed,
			"method_not_allowed", "This method is not supported.")
	})
}

func (h *Handler) cookieName() string {
	if h.secure {
		return "__Host-eneba_session"
	}
	return "eneba_session"
}

func (h *Handler) setCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.cookieName(),
		Value:    token,
		Path:     "/",
		Expires:  expires,
		MaxAge:   int(sessionLifetime.Seconds()),
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *Handler) clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.cookieName(),
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *Handler) token(r *http.Request) string {
	cookie, err := r.Cookie(h.cookieName())
	if err != nil {
		return ""
	}
	return cookie.Value
}

func (h *Handler) validOrigin(r *http.Request) bool {
	// Require the browser Origin header on every state-changing account action.
	return r.Header.Get("Origin") == h.origin
}

func (h *Handler) parseBody(w http.ResponseWriter, r *http.Request, target any) bool {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		httpapi.WriteError(w, http.StatusUnsupportedMediaType,
			"unsupported_media_type", "Send a JSON request.")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_request", "Invalid account details.")
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_request", "Invalid account details.")
		return false
	}
	return true
}

func (h *Handler) writeFailure(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_input",
			"Check your name, email and password.")
	case errors.Is(err, ErrEmailTaken):
		httpapi.WriteError(w, http.StatusConflict, "email_taken",
			"This email address already has an account.")
	case errors.Is(err, ErrRegistrationLimited):
		w.Header().Set("Retry-After", "60")
		httpapi.WriteError(w, http.StatusTooManyRequests, "registration_limited",
			"Too many registrations. Try again shortly.")
	case errors.Is(err, ErrRateLimited):
		w.Header().Set("Retry-After", "900")
		httpapi.WriteError(w, http.StatusTooManyRequests, "rate_limited",
			"Too many attempts. Try again later.")
	case errors.Is(err, ErrUnauthorized):
		httpapi.WriteError(w, http.StatusUnauthorized, "unauthorized",
			"Email or password is incorrect.")
	case errors.Is(err, database.ErrUnavailable),
		errors.Is(err, context.Canceled),
		errors.Is(err, context.DeadlineExceeded):
		h.logger.WarnContext(r.Context(), "authentication database unavailable",
			"request_id", w.Header().Get("X-Request-ID"))
		httpapi.WriteError(w, http.StatusServiceUnavailable, "service_unavailable",
			"Authentication is temporarily unavailable.")
	default:
		h.logger.ErrorContext(r.Context(), "authentication request failed",
			"request_id", w.Header().Get("X-Request-ID"))
		httpapi.WriteError(w, http.StatusInternalServerError, "internal_error",
			"The request could not be completed.")
	}
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		httpapi.WriteError(w, http.StatusForbidden, "forbidden", "Request origin is not allowed.")
		return
	}
	var input struct {
		DisplayName string `json:"displayName"`
		Email       string `json:"email"`
		Password    string `json:"password"`
	}
	if !h.parseBody(w, r, &input) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	user, token, err := h.service.Register(ctx, input.DisplayName, input.Email, input.Password)
	if err != nil {
		h.writeFailure(w, r, err)
		return
	}
	h.setCookie(w, token, h.service.now().Add(sessionLifetime))
	httpapi.WriteJSON(w, http.StatusCreated, map[string]any{"user": user})
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		httpapi.WriteError(w, http.StatusForbidden, "forbidden", "Request origin is not allowed.")
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !h.parseBody(w, r, &input) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	user, token, err := h.service.Login(ctx, input.Email, input.Password)
	if err != nil {
		h.writeFailure(w, r, err)
		return
	}
	h.setCookie(w, token, h.service.now().Add(sessionLifetime))
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	user, err := h.service.Current(ctx, h.token(r))
	if err != nil {
		if errors.Is(err, ErrUnauthorized) {
			httpapi.WriteError(w, http.StatusUnauthorized, "unauthorized", "Sign in to continue.")
			return
		}
		h.writeFailure(w, r, err)
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) {
		httpapi.WriteError(w, http.StatusForbidden, "forbidden", "Request origin is not allowed.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err := h.service.Logout(ctx, h.token(r)); err != nil {
		h.writeFailure(w, r, err)
		return
	}
	h.clearCookie(w)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusNoContent)
}
