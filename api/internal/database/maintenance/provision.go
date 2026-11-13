package maintenance

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5"
)

type localDatabase struct {
	name          string
	owner         string
	app           string
	ownerPassword string
	appPassword   string
}

func ProvisionLocal(ctx context.Context, root string) error {
	envPath := filepath.Join(root, ".env")
	if _, err := os.Stat(envPath); err == nil {
		return errors.New(".env already exists; provisioning will not overwrite existing configuration")
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if os.Getenv("PGPASSWORD") == "" {
		return errors.New("set local administrator access in .env.bootstrap.local first")
	}
	adminConfig, err := pgx.ParseConfig("")
	if err != nil {
		return errors.New("invalid local administrator configuration")
	}
	if adminConfig.Host != "127.0.0.1" && adminConfig.Host != "localhost" && adminConfig.Host != "::1" {
		return errors.New("local provisioning accepts loopback PostgreSQL hosts only")
	}
	admin, err := pgx.ConnectConfig(ctx, adminConfig)
	if err != nil {
		return errors.New("cannot authenticate to the local PostgreSQL administrator account")
	}
	defer admin.Close(ctx)
	databases := []localDatabase{
		{name: "eneba_dev", owner: "eneba_dev_owner", app: "eneba_dev_app"},
		{name: "eneba_test", owner: "eneba_test_owner", app: "eneba_test_app"},
	}
	// Inspect all names before creating anything. Never adopt an unrelated role.
	for _, db := range databases {
		var collision bool
		err := admin.QueryRow(ctx,
			"SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ($2,$3))",
			db.name, db.owner, db.app).Scan(&collision)
		if err != nil {
			return err
		}
		if collision {
			return fmt.Errorf("database or role names for %s already exist; inspect them before provisioning", db.name)
		}
	}
	roleTx, err := admin.Begin(ctx)
	if err != nil {
		return err
	}
	defer roleTx.Rollback(ctx)
	for i := range databases {
		databases[i].ownerPassword, err = randomPassword()
		if err != nil {
			return err
		}
		databases[i].appPassword, err = randomPassword()
		if err != nil {
			return err
		}
		for role, password := range map[string]string{databases[i].owner: databases[i].ownerPassword, databases[i].app: databases[i].appPassword} {
			statement := "CREATE ROLE " + pgx.Identifier{role}.Sanitize() + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '" + password + "'"
			if _, err := roleTx.Exec(ctx, statement); err != nil {
				return errors.New("cannot create isolated project roles")
			}
		}
	}
	if err := roleTx.Commit(ctx); err != nil {
		return err
	}
	for _, db := range databases {
		if _, err := admin.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{db.name}.Sanitize()+" OWNER "+pgx.Identifier{db.owner}.Sanitize()); err != nil {
			return fmt.Errorf("cannot create %s; role creation succeeded, so inspect partial provisioning before retrying", db.name)
		}
		if _, err := admin.Exec(ctx, "REVOKE ALL ON DATABASE "+pgx.Identifier{db.name}.Sanitize()+" FROM PUBLIC"); err != nil {
			return err
		}
		if _, err := admin.Exec(ctx, "GRANT CONNECT ON DATABASE "+pgx.Identifier{db.name}.Sanitize()+" TO "+pgx.Identifier{db.app}.Sanitize()); err != nil {
			return err
		}
	}
	connection := func(db localDatabase, owner bool) string {
		role, password := db.app, db.appPassword
		if owner {
			role, password = db.owner, db.ownerPassword
		}
		value := url.URL{Scheme: "postgres", User: url.UserPassword(role, password), Host: net.JoinHostPort(adminConfig.Host, fmt.Sprint(adminConfig.Port)), Path: db.name}
		query := value.Query()
		query.Set("sslmode", "disable")
		value.RawQuery = query.Encode()
		return value.String()
	}
	lines := []string{
		"APP_ENV=development", "PORT=8080", "APP_ORIGIN=http://127.0.0.1:5173",
		"DATABASE_URL=" + connection(databases[0], false),
		"MIGRATION_DATABASE_URL=" + connection(databases[0], true),
		"TEST_DATABASE_URL=" + connection(databases[1], false),
		"TEST_MIGRATION_DATABASE_URL=" + connection(databases[1], true),
	}
	envFile, err := os.OpenFile(envPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return errors.New("databases created but .env could not be written; inspect local provisioning")
	}
	_, writeErr := envFile.WriteString(strings.Join(lines, "\n") + "\n")
	closeErr := envFile.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}

func randomPassword() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}
