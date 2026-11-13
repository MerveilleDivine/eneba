package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

func RegisterHealth(mux *http.ServeMux, checkReadiness func(context.Context) error, logger *slog.Logger) {
	HandleGET(mux, "/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeStatus(w, http.StatusOK, "ok")
	})
	HandleGET(mux, "/readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := checkReadiness(ctx); err != nil {
			logger.WarnContext(ctx, "readiness check failed", "request_id", w.Header().Get("X-Request-ID"))
			writeStatus(w, http.StatusServiceUnavailable, "not_ready")
			return
		}
		writeStatus(w, http.StatusOK, "ready")
	})
}

// The exact-path fallback preserves 405 even when the application has a JSON
// catch-all for unknown paths. GET also supports HEAD through net/http.
func HandleGET(mux *http.ServeMux, path string, handler http.HandlerFunc) {
	mux.HandleFunc("GET "+path, handler)
	mux.HandleFunc(path, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Allow", "GET, HEAD")
		WriteError(w, http.StatusMethodNotAllowed, "method_not_allowed", "This method is not supported.")
	})
}

func NotFound(w http.ResponseWriter, _ *http.Request) {
	WriteError(w, http.StatusNotFound, "not_found", "This endpoint does not exist.")
}

func WriteError(w http.ResponseWriter, status int, code, message string) {
	WriteJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func WriteJSON(w http.ResponseWriter, code int, value any) {
	// Encode before committing headers so an invalid value cannot become a
	// truncated success response.
	body, err := json.Marshal(value)
	if err != nil {
		code = http.StatusInternalServerError
		body = []byte(`{"error":{"code":"internal_error","message":"The service could not complete the request."}}`)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(code)
	_, _ = w.Write(append(body, '\n'))
}

func writeStatus(w http.ResponseWriter, code int, status string) {
	WriteJSON(w, code, map[string]string{"status": status})
}

type responseRecorder struct {
	http.ResponseWriter
	status int
}

func (w *responseRecorder) WriteHeader(code int) {
	if code >= 100 && code < 200 {
		w.ResponseWriter.WriteHeader(code)
		return
	}
	if w.status != 0 {
		return
	}
	w.ResponseWriter.WriteHeader(code)
	w.status = code
}

func (w *responseRecorder) Write(body []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}

func (w *responseRecorder) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *responseRecorder) FlushError() error {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	return http.NewResponseController(w.ResponseWriter).Flush()
}

func Wrap(next http.Handler, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		requestID := rand.Text()
		w.Header().Set("X-Request-ID", requestID)
		recorder := &responseRecorder{ResponseWriter: w}
		defer func() {
			aborted, failed := false, false
			if panicValue := recover(); panicValue != nil {
				failed = true
				logger.Error("unexpected HTTP panic", "request_id", requestID)
				if panicValue == http.ErrAbortHandler || recorder.status != 0 {
					aborted = true
				} else {
					WriteError(recorder, http.StatusInternalServerError, "internal_error", "The service could not complete the request.")
				}
			}
			status := recorder.status
			if status == 0 {
				status = http.StatusOK
			}
			failed = failed || status >= http.StatusInternalServerError
			logger.Info("http request",
				"request_id", requestID,
				"method", r.Method,
				"path", r.URL.Path,
				"status", status,
				"failed", failed,
				"duration_ms", time.Since(started).Milliseconds())
			if aborted {
				panic(http.ErrAbortHandler)
			}
		}()
		next.ServeHTTP(recorder, r)
	})
}
