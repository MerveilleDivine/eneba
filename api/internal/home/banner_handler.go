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

type BannerHandler struct {
	service *BannerService
	logger  *slog.Logger
}

func NewBannerHandler(service *BannerService, logger *slog.Logger) *BannerHandler {
	return &BannerHandler{service: service, logger: logger}
}

func (h *BannerHandler) RegisterRoutes(mux *http.ServeMux) {
	httpapi.HandleGET(mux, "/api/v1/home/banners", h.list)
}

func (h *BannerHandler) list(w http.ResponseWriter, r *http.Request) {
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
		h.logger.WarnContext(ctx, "homepage banners temporarily unavailable", "request_id", requestID)
		httpapi.WriteError(w, http.StatusServiceUnavailable, "service_unavailable", "The banners are temporarily unavailable. Please try again.")
		return
	}
	h.logger.ErrorContext(ctx, "homepage banner read failed", "request_id", requestID)
	httpapi.WriteError(w, http.StatusInternalServerError, "internal_error", "The service could not complete the request.")
}
