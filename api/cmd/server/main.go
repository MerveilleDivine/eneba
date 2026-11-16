package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/auth"
	"github.com/MerveilleDivine/eneba/api/internal/catalog"
	"github.com/MerveilleDivine/eneba/api/internal/config"
	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/home"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
	"github.com/MerveilleDivine/eneba/api/internal/purchase"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("server stopped", "reason", err.Error())
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	pool, err := database.OpenPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	host := "127.0.0.1"
	if cfg.Environment == "production" {
		host = "0.0.0.0"
	}
	mux := http.NewServeMux()
	httpapi.RegisterHealth(mux, func(ctx context.Context) error { return database.CheckReadiness(ctx, pool) }, logger)
	catalogRepository := catalog.NewRepository(pool)
	catalogService := catalog.NewService(catalogRepository)
	catalog.NewHandler(catalogService, logger).RegisterRoutes(mux)
	bannerRepository := home.NewBannerRepository(pool)
	bannerService := home.NewBannerService(bannerRepository)
	home.NewBannerHandler(bannerService, logger).RegisterRoutes(mux)
	bestSellerRepository := home.NewBestSellerRepository(pool)
	bestSellerService := home.NewBestSellerService(bestSellerRepository)
	home.NewBestSellerHandler(bestSellerService, logger).RegisterRoutes(mux)
	dealRepository := home.NewDealRepository(pool)
	dealService := home.NewDealService(dealRepository)
	home.NewDealHandler(dealService, logger).RegisterRoutes(mux)
	authRepository := auth.NewRepository(pool)
	authService := auth.NewService(authRepository)
	auth.NewHandler(authService, logger, cfg.Origin, cfg.Environment == "production").RegisterRoutes(mux)
	quoteRepository := purchase.NewRepository(pool)
	quoteService := purchase.NewService(quoteRepository)
	purchase.NewHandler(quoteService, logger).RegisterRoutes(mux)
	purchase.NewCheckoutHandler(purchase.NewCheckoutService(quoteRepository), authService, logger, cfg.Origin, cfg.Environment == "production").RegisterRoutes(mux)
	mux.HandleFunc("/", httpapi.NotFound)
	server := &http.Server{
		Addr:              net.JoinHostPort(host, cfg.Port),
		Handler:           httpapi.Wrap(mux, logger),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	serverErrors := make(chan error, 1)
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		return err
	}
	go func() { serverErrors <- server.Serve(listener) }()
	logger.Info("server listening", "port", cfg.Port, "environment", cfg.Environment)
	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return errors.New("graceful shutdown timed out")
		}
		logger.Info("server shut down")
		return nil
	}
}
