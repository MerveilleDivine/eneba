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
	logger *slog.Logger
	origin string
	secure bool
}
func NewHandler(service *Service, logger *slog.Logger, origin string, secure bool) *Handler {
	return &Handler{service: service, logger: logger, origin: origin, secure: secure}
}
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	for _, route := range []struct { path string; method string; handler http.HandlerFunc }{
		{"/api/v1/auth/register", "POST", h.register},
		{"/api/v1/auth/login", "POST", h.login},
		{"/api/v1/auth/logout", "POST", h.logout},
		{"/api/v1/auth/me", "GET", h.me},
	} {
		mux.HandleFunc(route.method+" "+route.path, route.handler)
		allowed := route.method
		if allowed == "GET" { allowed = "GET, HEAD" }
		mux.HandleFunc(route.path, func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Allow", allowed)
			httpapi.WriteError(w, 405, "method_not_allowed", "This method is not supported.")
		})
	}
}
func (h *Handler) cookieName() string {
	if h.secure { return "__Host-eneba_session" }
	return "eneba_session"
}
func (h *Handler) setCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name: h.cookieName(), Value: token, Path: "/", Expires: expires,
		MaxAge: int(sessionLifetime.Seconds()), HttpOnly: true, Secure: h.secure,
		SameSite: http.SameSiteLaxMode,
	})
}
func (h *Handler) clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: h.cookieName(), Path: "/", MaxAge: -1, Expires: time.Unix(0,0),
		HttpOnly: true, Secure: h.secure, SameSite: http.SameSiteLaxMode,
	})
}
func (h *Handler) token(r *http.Request) string {
	cookie, err := r.Cookie(h.cookieName())
	if err != nil { return "" }
	return cookie.Value
}
func (h *Handler) validOrigin(r *http.Request) bool {
	return r.Header.Get("Origin") == h.origin
}
func (h *Handler) parseBody(w http.ResponseWriter, r *http.Request, target any) bool {
	mimeType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mimeType != "application/json" {
		httpapi.WriteError(w, 415, "unsupported_media_type", "Send a JSON request.")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		httpapi.WriteError(w, 400, "invalid_request", "Invalid account details.")
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		httpapi.WriteError(w, 400, "invalid_request", "Invalid account details.")
		return false
	}
	return true
}
func (h *Handler) writeFailure(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		httpapi.WriteError(w, 400, "invalid_input", "Check your name, email and password.")
	case errors.Is(err, ErrEmailTaken):
		httpapi.WriteError(w, 409, "email_taken", "This email address already has an account.")
	case errors.Is(err, ErrRateLimited):
		w.Header().Set("Retry-After", "900")
		httpapi.WriteError(w, 429, "rate_limited", "Too many attempts. Try again later.")
	case errors.Is(err, ErrUnauthorized):
		httpapi.WriteError(w, 401, "unauthorized", "Email or password is incorrect.")
	case errors.Is(err, database.ErrUnavailable), errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		h.logger.WarnContext(r.Context(), "authentication database unavailable", "request_id", w.Header().Get("X-Request-ID"))
		httpapi.WriteError(w, 503, "service_unavailable", "Authentication is temporarily unavailable.")
	default:
		h.logger.ErrorContext(r.Context(), "authentication request failed", "request_id", w.Header().Get("X-Request-ID"))
		httpapi.WriteError(w, 500, "internal_error", "The request could not be completed.")
	}
}
func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) { httpapi.WriteError(w, 403, "forbidden", "Request origin is not allowed."); return }
	var input struct {
		DisplayName string `json:"displayName"`
		Email string `json:"email"`
		Password string `json:"password"`
	}
	if !h.parseBody(w,r,&input) { return }
	ctx,cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	user,token,err := h.service.Register(ctx,input.DisplayName,input.Email,input.Password)
	if err != nil { h.writeFailure(w,r,err); return }
	h.setCookie(w,token,h.service.now().Add(sessionLifetime))
	httpapi.WriteJSON(w,201,map[string]any{"user":user})
}
func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) { httpapi.WriteError(w, 403, "forbidden", "Request origin is not allowed."); return }
	var input struct { Email string `json:"email"`; Password string `json:"password"` }
	if !h.parseBody(w,r,&input) { return }
	ctx,cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	user,token,err := h.service.Login(ctx,input.Email,input.Password)
	if err != nil { h.writeFailure(w,r,err); return }
	h.setCookie(w,token,h.service.now().Add(sessionLifetime))
	httpapi.WriteJSON(w,200,map[string]any{"user":user})
}
func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	ctx,cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	user,err := h.service.Current(ctx,h.token(r))
	if err != nil {
		if errors.Is(err,ErrUnauthorized) { httpapi.WriteError(w,401,"unauthorized","Sign in to continue."); return }
		h.writeFailure(w,r,err)
		return
	}
	httpapi.WriteJSON(w,200,map[string]any{"user":user})
}
func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if !h.validOrigin(r) { httpapi.WriteError(w,403,"forbidden","Request origin is not allowed."); return }
	ctx,cancel := context.WithTimeout(r.Context(),3*time.Second)
	defer cancel()
	if err := h.service.Logout(ctx,h.token(r)); err != nil { h.writeFailure(w,r,err); return }
	h.clearCookie(w)
	w.Header().Set("Cache-Control","no-store")
	w.Header().Set("X-Content-Type-Options","nosniff")
	w.WriteHeader(204)
}
