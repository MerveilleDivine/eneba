package purchase

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
}

func NewHandler(service *Service, logger *slog.Logger) *Handler {
	return &Handler{service: service, logger: logger}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/cart/quote", h.quote)
	mux.HandleFunc("/api/v1/cart/quote", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Allow", "POST")
		httpapi.WriteError(w, http.StatusMethodNotAllowed, "method_not_allowed", "This method is not supported.")
	})
}

func (h *Handler) quote(w http.ResponseWriter, r *http.Request) {
	if r.URL.RawQuery != "" {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_query", "Unexpected query parameters.")
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		httpapi.WriteError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Send a JSON request.")
		return
	}

	// No credentials or user-specific data: quoting is a safe, nonmutating
	// operation despite its POST transport for bounded cart-line payloads.
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var request QuoteRequest
	if err := decoder.Decode(&request); err != nil {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_cart", "Please check your cart items.")
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_cart", "Please check your cart items.")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	quote, err := h.service.Quote(ctx, request)
	switch {
	case err == nil:
		httpapi.WriteJSON(w, http.StatusOK, quote)
	case errors.Is(err, ErrInvalidCart):
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_cart", "Please check your cart items.")
	case errors.Is(err, database.ErrUnavailable), errors.Is(err, context.DeadlineExceeded), ctx.Err() != nil:
		h.logger.WarnContext(ctx, "cart quote unavailable", "request_id", w.Header().Get("X-Request-ID"))
		httpapi.WriteError(w, http.StatusServiceUnavailable, "service_unavailable", "Cart prices are temporarily unavailable.")
	default:
		h.logger.ErrorContext(ctx, "cart quote failed", "request_id", w.Header().Get("X-Request-ID"))
		httpapi.WriteError(w, http.StatusInternalServerError, "internal_error", "We couldn't check your cart.")
	}
}
