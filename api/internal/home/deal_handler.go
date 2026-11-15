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

type DealHandler struct {
	service *DealService
	logger *slog.Logger
}

func NewDealHandler(service *DealService, logger *slog.Logger) *DealHandler {
	return &DealHandler{service: service, logger: logger}
}

func (h *DealHandler) RegisterRoutes(mux *http.ServeMux) {
	httpapi.HandleGET(mux, "/api/v1/home/deals", h.list)
}

func (h *DealHandler) list(w http.ResponseWriter, r *http.Request) {
	if r.URL.RawQuery != "" {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_query", "This endpoint does not accept query parameters.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	page, rejected, err := h.service.List(ctx)
	if err == nil {
		for _, issue := range rejected {
			h.logger.WarnContext(ctx, "invalid homepage deal skipped",
				"request_id", w.Header().Get("X-Request-ID"),
				"offer_id", issue.OfferID, "reason", issue.Reason)
		}
		httpapi.WriteJSON(w, http.StatusOK, page)
		return
	}
	requestID := w.Header().Get("X-Request-ID")
	if errors.Is(err, database.ErrUnavailable) || ctx.Err() != nil {
		h.logger.WarnContext(ctx, "homepage deals temporarily unavailable", "request_id", requestID)
		httpapi.WriteError(w, http.StatusServiceUnavailable, "service_unavailable", "Deals are temporarily unavailable. Please try again.")
		return
	}
	h.logger.ErrorContext(ctx, "homepage deals read failed", "request_id", requestID)
	httpapi.WriteError(w, http.StatusInternalServerError, "internal_error", "The service could not complete the request.")
}
