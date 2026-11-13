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
	if err := checkProvisioningFiles(root); err != nil {
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
	for i := range databases {
		databases[i].ownerPassword, err = randomPassword()
		if err != nil {
			return err
		}
		databases[i].appPassword, err = randomPassword()
		if err != nil {
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
	return provisionWithRecovery(root, strings.Join(lines, "\n")+"\n", func() error {
		return createLocalDatabases(ctx, admin, databases)
	})
}

func createLocalDatabases(ctx context.Context, admin *pgx.Conn, databases []localDatabase) error {
	roleTx, err := admin.Begin(ctx)
	if err != nil {
		return errors.New("cannot begin role creation")
	}
	defer roleTx.Rollback(ctx)
	for _, db := range databases {
		for _, role := range []struct{ name, password string }{{db.owner, db.ownerPassword}, {db.app, db.appPassword}} {
			// Generated passwords contain only URL-safe base64 characters.
			statement := "CREATE ROLE " + pgx.Identifier{role.name}.Sanitize() + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '" + role.password + "'"
			if _, err := roleTx.Exec(ctx, statement); err != nil {
				return errors.New("cannot create isolated project roles")
			}
		}
	}
	if err := roleTx.Commit(ctx); err != nil {
		return errors.New("cannot commit project roles")
	}
	for _, db := range databases {
		if _, err := admin.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{db.name}.Sanitize()+" OWNER "+pgx.Identifier{db.owner}.Sanitize()); err != nil {
			return fmt.Errorf("cannot create %s", db.name)
		}
		if _, err := admin.Exec(ctx, "REVOKE ALL ON DATABASE "+pgx.Identifier{db.name}.Sanitize()+" FROM PUBLIC"); err != nil {
			return errors.New("cannot restrict project database access")
		}
		if _, err := admin.Exec(ctx, "GRANT CONNECT ON DATABASE "+pgx.Identifier{db.name}.Sanitize()+" TO "+pgx.Identifier{db.app}.Sanitize()); err != nil {
			return errors.New("cannot grant project application access")
		}
	}
	return nil
}

func checkProvisioningFiles(root string) error {
	for _, name := range []string{".env", ".env.provisioning.local"} {
		if _, err := os.Stat(filepath.Join(root, name)); err == nil {
			return fmt.Errorf("%s already exists; preserve it and inspect provisioning before retrying", name)
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

// Files and CREATE DATABASE cannot share a transaction. Persist recovery first;
// never retry by adopting resources or deleting an existing database.
func provisionWithRecovery(root, contents string, create func() error) error {
	if err := checkProvisioningFiles(root); err != nil {
		return err
	}
	recovery := filepath.Join(root, ".env.provisioning.local")
	if err := writePrivateConfiguration(recovery, contents); err != nil {
		return errors.New("cannot persist recovery credentials; no database resources were created")
	}
	if err := create(); err != nil {
		return fmt.Errorf("%w; credentials retained in .env.provisioning.local; inspect named project resources before retrying", err)
	}
	if err := writePrivateConfiguration(filepath.Join(root, ".env"), contents); err != nil {
		return errors.New("cannot publish .env; credentials retained in .env.provisioning.local; inspect local configuration")
	}
	if err := os.Remove(recovery); err != nil {
		return errors.New(".env saved; remove the redundant .env.provisioning.local after verifying it")
	}
	return nil
}

func writePrivateConfiguration(path, contents string) error {
	envFile, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer envFile.Close()
	if _, err := envFile.WriteString(contents); err != nil {
		return err
	}
	if err := envFile.Sync(); err != nil {
		return err
	}
	return envFile.Close()
}

func randomPassword() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}
