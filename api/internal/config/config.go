package config

import (
	"errors"
	"net/url"
	"strconv"
)

type Config struct {
	Environment string
	Port        string
	DatabaseURL string
}

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Environment: getenv("APP_ENV"),
		Port:        getenv("PORT"),
		DatabaseURL: getenv("DATABASE_URL"),
	}
	if cfg.Environment == "" {
		cfg.Environment = "development"
	}
	if cfg.Environment != "development" && cfg.Environment != "test" && cfg.Environment != "production" {
		return Config{}, errors.New("APP_ENV must be development, test, or production")
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	port, err := strconv.Atoi(cfg.Port)
	if err != nil || port < 1 || port > 65535 {
		return Config{}, errors.New("PORT must be an integer from 1 to 65535")
	}
	if err := ValidateDatabaseURL(cfg.DatabaseURL); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func ValidateDatabaseURL(value string) error {
	parsed, err := url.Parse(value)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") || parsed.Hostname() == "" || parsed.Path == "" || parsed.Path == "/" {
		return errors.New("database connection must be a PostgreSQL URL with a host and database")
	}
	return nil
}
