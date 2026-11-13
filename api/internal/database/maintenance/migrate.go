package maintenance

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"strings"

	"github.com/MerveilleDivine/eneba/api/internal/config"

	"github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func Migrate(ctx context.Context, migrationURL, applicationURL, directory string) (int, error) {
	if err := validateMigrationTarget(migrationURL, applicationURL); err != nil {
		return 0, err
	}
	owner, err := sql.Open("pgx", migrationURL)
	if err != nil {
		return 0, errors.New("cannot initialize migration connection")
	}
	defer owner.Close()
	owner.SetMaxOpenConns(1)
	// Authenticate both identities before Goose can create even its version ledger.
	var ownerDatabase string
	if err := owner.QueryRowContext(ctx, "SELECT current_database()").Scan(&ownerDatabase); err != nil {
		return 0, errors.New("cannot authenticate using migration credentials")
	}
	app, err := pgx.Connect(ctx, applicationURL)
	if err != nil {
		return 0, errors.New("cannot authenticate using application credentials")
	}
	var appRole, appDatabase string
	err = app.QueryRow(ctx, "SELECT current_user, current_database()").Scan(&appRole, &appDatabase)
	_ = app.Close(ctx)
	if err != nil || appDatabase != ownerDatabase {
		return 0, errors.New("cannot verify application database identity")
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, owner, os.DirFS(directory), goose.WithTableName("public.goose_db_version"), goose.WithLogger(log.New(io.Discard, "", 0)))
	if err != nil {
		return 0, fmt.Errorf("initialize migrations: %w", err)
	}
	results, err := provider.Up(ctx)
	if err != nil {
		return 0, fmt.Errorf("apply migrations: %w", err)
	}
	if err := grantApplicationAccess(ctx, owner, appRole); err != nil {
		return 0, err
	}
	return len(results), nil
}

func MigrationStatus(ctx context.Context, migrationURL, directory string) ([]*goose.MigrationStatus, error) {
	owner, err := sql.Open("pgx", migrationURL)
	if err != nil {
		return nil, errors.New("cannot initialize migration connection")
	}
	defer owner.Close()
	owner.SetMaxOpenConns(1)
	provider, err := goose.NewProvider(goose.DialectPostgres, owner, os.DirFS(directory), goose.WithTableName("public.goose_db_version"), goose.WithLogger(log.New(io.Discard, "", 0)))
	if err != nil {
		return nil, err
	}
	return provider.Status(ctx)
}

// Require one explicit endpoint. In particular, a shared Supabase pooler host
// and the common database name "postgres" do not identify a project on their own.
func validateMigrationTarget(migrationURL, applicationURL string) error {
	parse := func(value string) (*pgx.ConnConfig, error) {
		if err := config.ValidateDatabaseURL(value); err != nil {
			return nil, errors.New("invalid migration or application database configuration")
		}
		cfg, err := pgx.ParseConfig(value)
		if err != nil {
			return nil, errors.New("invalid migration or application database configuration")
		}
		for _, fallback := range cfg.Fallbacks {
			if fallback.Host != cfg.Host || fallback.Port != cfg.Port {
				return nil, errors.New("maintenance requires a single database endpoint")
			}
		}
		return cfg, nil
	}
	owner, err := parse(migrationURL)
	if err != nil {
		return err
	}
	app, err := parse(applicationURL)
	if err != nil {
		return err
	}
	host := func(cfg *pgx.ConnConfig) string { return strings.TrimSuffix(strings.ToLower(cfg.Host), ".") }
	if host(owner) != host(app) || owner.Port != app.Port || owner.Database != app.Database {
		return errors.New("application and migration connections must target the same endpoint and database")
	}
	if strings.HasSuffix(host(owner), ".pooler.supabase.com") {
		project := func(user string) string {
			index := strings.LastIndexByte(user, '.')
			if index < 0 {
				return ""
			}
			return user[index+1:]
		}
		if project(owner.User) == "" || project(owner.User) != project(app.User) {
			return errors.New("application and migration pooler credentials must identify the same project")
		}
	}
	return nil
}

func grantApplicationAccess(ctx context.Context, owner *sql.DB, appRole string) error {
	role := pgx.Identifier{appRole}.Sanitize()
	tx, err := owner.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, statement := range []string{
		"REVOKE ALL ON SCHEMA marketplace FROM PUBLIC",
		"GRANT USAGE ON SCHEMA marketplace, extensions TO " + role,
		"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA marketplace TO " + role,
		"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA marketplace TO " + role,
	} {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("configure application privileges: %w", err)
		}
	}
	return tx.Commit()
}
