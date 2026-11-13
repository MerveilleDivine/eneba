package catalog

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
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
	httpapi.HandleGET(mux, "/api/v1/products", h.list)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	filter, err := parseFilter(r.URL.RawQuery)
	var page Page
	if err == nil {
		page, err = h.service.List(ctx, filter)
	}
	if err == nil {
		httpapi.WriteJSON(w, http.StatusOK, page)
		return
	}
	if errors.Is(err, ErrInvalidQuery) {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_query", err.Error())
		return
	}
	requestID := w.Header().Get("X-Request-ID")
	if errors.Is(err, database.ErrUnavailable) || ctx.Err() != nil {
		h.logger.WarnContext(ctx, "catalog temporarily unavailable", "request_id", requestID)
		httpapi.WriteError(w, http.StatusServiceUnavailable, "service_unavailable", "The catalog is temporarily unavailable. Please try again.")
		return
	}
	h.logger.ErrorContext(ctx, "catalog read failed", "request_id", requestID)
	httpapi.WriteError(w, http.StatusInternalServerError, "internal_error", "The service could not complete the request.")
}

func parseFilter(rawQuery string) (Filter, error) {
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		return Filter{}, fmt.Errorf("%w: invalid query encoding", ErrInvalidQuery)
	}
	filter := Filter{Page: 1, PageSize: 24}
	for key, entries := range values {
		if len(entries) != 1 {
			return Filter{}, fmt.Errorf("%w: parameters must not be repeated", ErrInvalidQuery)
		}
		value := entries[0]
		var parseError error
		switch key {
		case "q":
			filter.Query = value
		case "platform":
			filter.Platform = value
		case "region":
			filter.Region = value
		case "sort":
			filter.Sort = value
		case "page":
			filter.Page, parseError = strconv.ParseInt(value, 10, 64)
		case "pageSize":
			filter.PageSize, parseError = strconv.ParseInt(value, 10, 64)
		case "minPriceCents", "maxPriceCents":
			var amount int64
			amount, parseError = strconv.ParseInt(value, 10, 64)
			if key == "minPriceCents" {
				filter.MinPriceCents = &amount
			} else {
				filter.MaxPriceCents = &amount
			}
		default:
			return Filter{}, fmt.Errorf("%w: unknown parameter", ErrInvalidQuery)
		}
		if parseError != nil {
			return Filter{}, fmt.Errorf("%w: numeric parameters must be integers", ErrInvalidQuery)
		}
	}
	return filter, nil
}
