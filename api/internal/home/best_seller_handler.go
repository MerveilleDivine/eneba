package home

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
)

type BestSellerHandler struct {
	service *BestSellerService
	logger  *slog.Logger
}

func NewBestSellerHandler(service *BestSellerService, logger *slog.Logger) *BestSellerHandler {
	return &BestSellerHandler{service: service, logger: logger}
}

func (h *BestSellerHandler) RegisterRoutes(mux *http.ServeMux) {
	httpapi.HandleGET(mux, "/api/v1/home/best-sellers", h.list)
}

func (h *BestSellerHandler) list(w http.ResponseWriter, r *http.Request) {
	if r.URL.RawQuery != "" {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_query", "This endpoint does not accept query parameters.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	page, err := h.service.List(ctx)
	if err == nil {
		httpapi.WriteJSON(w, http.StatusOK, page)
		return
	}
	requestID := w.Header().Get("X-Request-ID")
	if errors.Is(err, database.ErrUnavailable) || ctx.Err() != nil {
		h.logger.WarnContext(ctx, "best sellers temporarily unavailable", "request_id", requestID)
		httpapi.WriteError(w, http.StatusServiceUnavailable, "service_unavailable", "Best sellers are temporarily unavailable. Please try again.")
		return
	}
	h.logger.ErrorContext(ctx, "best sellers read failed", "request_id", requestID)
	httpapi.WriteError(w, http.StatusInternalServerError, "internal_error", "The service could not complete the request.")
}
