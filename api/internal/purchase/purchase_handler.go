package purchase

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/auth"
	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
)

type CheckoutHandler struct {
	service    *CheckoutService
	accounts   *auth.Service
	logger     *slog.Logger
	origin     string
	cookieName string
}

func NewCheckoutHandler(service *CheckoutService, accounts *auth.Service, logger *slog.Logger, origin string, secure bool) *CheckoutHandler {
	cookie := "eneba_session"
	if secure {
		cookie = "__Host-eneba_session"
	}
	return &CheckoutHandler{service: service, accounts: accounts, logger: logger, origin: origin, cookieName: cookie}
}

func (h *CheckoutHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/checkout", h.checkout)
	mux.HandleFunc("/api/v1/checkout", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Allow", "POST")
		httpapi.WriteError(w, http.StatusMethodNotAllowed, "method_not_allowed", "This method is not supported.")
	})
}

func (h *CheckoutHandler) checkout(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Origin") != h.origin {
		httpapi.WriteError(w, http.StatusForbidden, "forbidden", "Request origin is not allowed.")
		return
	}
	if r.URL.RawQuery != "" {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_query", "Unexpected query parameters.")
		return
	}
	cookie, err := r.Cookie(h.cookieName)
	if err != nil || cookie.Value == "" {
		httpapi.WriteError(w, http.StatusUnauthorized, "unauthorized", "Sign in to continue.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	user, err := h.accounts.Current(ctx, cookie.Value)
	if err != nil {
		if errors.Is(err, auth.ErrUnauthorized) {
			httpapi.WriteError(w, http.StatusUnauthorized, "unauthorized", "Sign in to continue.")
			return
		}
		h.writeFailure(w, r, err)
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		httpapi.WriteError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Send a JSON request.")
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if !offerIDPattern.MatchString(key) {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_checkout", "Please review your order.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input PurchaseRequest
	if decoder.Decode(&input) != nil {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_checkout", "Please review your order.")
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_checkout", "Please review your order.")
		return
	}
	result, err := h.service.Purchase(ctx, user.ID, key, input)
	if err != nil {
		h.writeFailure(w, r, err)
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, result)
}

func (h *CheckoutHandler) writeFailure(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrInvalidCheckout):
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_checkout", "Please review your order.")
	case errors.Is(err, ErrBuyerNotFound), errors.Is(err, auth.ErrUnauthorized):
		httpapi.WriteError(w, http.StatusUnauthorized, "unauthorized", "Sign in to continue.")
	case errors.Is(err, ErrPriceChanged):
		httpapi.WriteError(w, http.StatusConflict, "PRICE_CHANGED", "Prices have changed. Review your cart.")
	case errors.Is(err, ErrOutOfStock):
		httpapi.WriteError(w, http.StatusConflict, "OUT_OF_STOCK", "One or more items are no longer available.")
	case errors.Is(err, ErrIdempotencyConflict):
		httpapi.WriteError(w, http.StatusConflict, "IDEMPOTENCY_CONFLICT", "This order attempt has changed. Refresh your cart.")
	case errors.Is(err, database.ErrUnavailable), errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		h.logger.WarnContext(r.Context(), "checkout temporarily unavailable", "request_id", w.Header().Get("X-Request-ID"))
		httpapi.WriteError(w, http.StatusServiceUnavailable, "service_unavailable", "Checkout is temporarily unavailable.")
	default:
		h.logger.ErrorContext(r.Context(), "checkout failed", "request_id", w.Header().Get("X-Request-ID"))
		httpapi.WriteError(w, http.StatusInternalServerError, "internal_error", "We couldn't place your order.")
	}
}
