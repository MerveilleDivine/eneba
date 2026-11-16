package purchase

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/auth"
	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
)

type OrderHandler struct {
	service    *OrderService
	accounts   *auth.Service
	logger     *slog.Logger
	cookieName string
}

func NewOrderHandler(service *OrderService, accounts *auth.Service, logger *slog.Logger, secure bool) *OrderHandler {
	cookie := "eneba_session"
	if secure {
		cookie = "__Host-eneba_session"
	}
	return &OrderHandler{service: service, accounts: accounts, logger: logger, cookieName: cookie}
}

func (h *OrderHandler) RegisterRoutes(mux *http.ServeMux) {
	httpapi.HandleGET(mux, "/api/v1/orders", h.read)
	httpapi.HandleGET(mux, "/api/v1/orders/{orderId}", h.read)
}

func (h *OrderHandler) read(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Add("Vary", "Cookie")
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	cookie, err := r.Cookie(h.cookieName)
	if err != nil || cookie.Value == "" {
		h.failure(ctx, w, auth.ErrUnauthorized)
		return
	}
	buyer, err := h.accounts.Current(ctx, cookie.Value)
	if err != nil {
		h.failure(ctx, w, err)
		return
	}
	if id := r.PathValue("orderId"); id != "" {
		if r.URL.RawQuery != "" {
			h.failure(ctx, w, ErrInvalidOrderQuery)
			return
		}
		order, err := h.service.Detail(ctx, buyer.ID, id)
		if err != nil {
			h.failure(ctx, w, err)
			return
		}
		httpapi.WriteJSON(w, http.StatusOK, order)
		return
	}
	page, err := h.service.List(ctx, buyer.ID, r.URL.RawQuery)
	if err != nil {
		h.failure(ctx, w, err)
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, page)
}

func (h *OrderHandler) failure(ctx context.Context, w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, auth.ErrUnauthorized), errors.Is(err, ErrBuyerNotFound):
		httpapi.WriteError(w, 401, "unauthorized", "Sign in to view your orders.")
	case errors.Is(err, ErrInvalidOrderQuery):
		httpapi.WriteError(w, 400, "invalid_query", "This order request is invalid.")
	case errors.Is(err, ErrOrderNotFound):
		httpapi.WriteError(w, 404, "order_not_found", "This order is not available.")
	case errors.Is(err, database.ErrUnavailable), ctx.Err() != nil:
		h.logger.WarnContext(ctx, "orders temporarily unavailable", "request_id", w.Header().Get("X-Request-ID"))
		httpapi.WriteError(w, 503, "service_unavailable", "Orders are temporarily unavailable. Please try again.")
	default:
		h.logger.ErrorContext(ctx, "order read failed", "request_id", w.Header().Get("X-Request-ID"))
		httpapi.WriteError(w, 500, "internal_error", "We couldn't load your orders.")
	}
}
