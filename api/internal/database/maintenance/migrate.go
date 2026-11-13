package maintenance

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log"
	"os"

	"github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func Migrate(ctx context.Context, migrationURL, applicationURL, directory string) (int, error) {
	owner, err := sql.Open("pgx", migrationURL)
	if err != nil {
		return 0, errors.New("cannot initialize migration connection")
	}
	defer owner.Close()
	owner.SetMaxOpenConns(1)
	provider, err := goose.NewProvider(goose.DialectPostgres, owner, os.DirFS(directory), goose.WithTableName("public.goose_db_version"), goose.WithLogger(log.New(io.Discard, "", 0)))
	if err != nil {
		return 0, fmt.Errorf("initialize migrations: %w", err)
	}
	results, err := provider.Up(ctx)
	if err != nil {
		return 0, fmt.Errorf("apply migrations: %w", err)
	}
	if err := grantApplicationAccess(ctx, migrationURL, applicationURL); err != nil {
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

func grantApplicationAccess(ctx context.Context, migrationURL, applicationURL string) error {
	app, err := pgx.Connect(ctx, applicationURL)
	if err != nil {
		return errors.New("cannot connect using application credentials for privilege configuration")
	}
	defer app.Close(ctx)
	var appRole, appDatabase string
	if err := app.QueryRow(ctx, "SELECT current_user, current_database()").Scan(&appRole, &appDatabase); err != nil {
		return errors.New("cannot identify application database role")
	}
	owner, err := pgx.Connect(ctx, migrationURL)
	if err != nil {
		return errors.New("cannot connect using migration credentials")
	}
	defer owner.Close(ctx)
	var ownerDatabase string
	if err := owner.QueryRow(ctx, "SELECT current_database()").Scan(&ownerDatabase); err != nil || ownerDatabase != appDatabase {
		return errors.New("application and migration connections must target the same database")
	}
	role := pgx.Identifier{appRole}.Sanitize()
	tx, err := owner.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, statement := range []string{
		"REVOKE ALL ON SCHEMA marketplace FROM PUBLIC",
		"GRANT USAGE ON SCHEMA marketplace, extensions TO " + role,
		"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA marketplace TO " + role,
		"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA marketplace TO " + role,
	} {
		if _, err := tx.Exec(ctx, statement); err != nil {
			return fmt.Errorf("configure application privileges: %w", err)
		}
	}
	return tx.Commit(ctx)
}
