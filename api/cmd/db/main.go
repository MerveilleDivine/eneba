package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/config"
	"github.com/MerveilleDivine/eneba/api/internal/database/maintenance"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Database command failed:", err)
		os.Exit(1)
	}
}

func run() error {
	root := flag.String("root", "..", "repository root")
	flag.Parse()
	if flag.NArg() != 1 {
		return errors.New("usage: db [-root path] provision|migrate|status|seed")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	migrations := filepath.Join(*root, "db", "migrations")
	switch flag.Arg(0) {
	case "provision":
		if err := maintenance.ProvisionLocal(ctx, *root); err != nil {
			return err
		}
		fmt.Println("Created eneba_dev and eneba_test with isolated owner/application roles. Local credentials saved in ignored .env.")
	case "migrate":
		migrationURL, appURL, err := connectionURLs()
		if err != nil {
			return err
		}
		count, err := maintenance.Migrate(ctx, migrationURL, appURL, migrations)
		if err != nil {
			return err
		}
		fmt.Printf("Applied %d migration(s).\n", count)
	case "status":
		migrationURL := os.Getenv("MIGRATION_DATABASE_URL")
		if err := config.ValidateDatabaseURL(migrationURL); err != nil {
			return err
		}
		statuses, err := maintenance.MigrationStatus(ctx, migrationURL, migrations)
		if err != nil {
			return err
		}
		for _, status := range statuses {
			fmt.Printf("%s: %s\n", filepath.Base(status.Source.Path), status.State)
		}
	case "seed":
		_, appURL, err := connectionURLs()
		if err != nil {
			return err
		}
		count, err := maintenance.SeedDatabase(ctx, appURL, filepath.Join(*root, "db", "seeds"))
		if err != nil {
			return err
		}
		fmt.Printf("Applied %d seed version(s).\n", count)
	default:
		return errors.New("unknown database command")
	}
	return nil
}

func connectionURLs() (string, string, error) {
	migrationURL, appURL := os.Getenv("MIGRATION_DATABASE_URL"), os.Getenv("DATABASE_URL")
	if err := config.ValidateDatabaseURL(migrationURL); err != nil {
		return "", "", errors.New("set a valid MIGRATION_DATABASE_URL")
	}
	if err := config.ValidateDatabaseURL(appURL); err != nil {
		return "", "", errors.New("set a valid DATABASE_URL")
	}
	return migrationURL, appURL, nil
}
