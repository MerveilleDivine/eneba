package catalog

import (
	"context"
	"net/http"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
)

func (h *Handler) product(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if r.URL.RawQuery != "" {
		httpapi.WriteError(w, http.StatusBadRequest, "invalid_query", "Product reads do not accept query parameters.")
		return
	}
	details, err := h.service.GetProduct(ctx, r.PathValue("slug"))
	if err != nil {
		h.writeReadError(ctx, w, err)
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, details)
}
