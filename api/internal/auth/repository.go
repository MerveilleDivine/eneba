package auth

import (
	"context"
	"errors"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Registration is atomic: a user without a persisted session is never created.
func (r *Repository) CreateAccount(
	ctx context.Context, user User, passwordHash string, digest []byte, expiry time.Time,
) (User, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return User{}, database.ClassifyReadError(err)
	}
	defer tx.Rollback(ctx)

	err = tx.QueryRow(ctx,
		"INSERT INTO marketplace.users(email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id::text",
		user.Email, user.DisplayName, passwordHash).Scan(&user.ID)
	if err != nil {
		var pgerr *pgconn.PgError
		if errors.As(err, &pgerr) && pgerr.Code == "23505" {
			return User{}, ErrEmailTaken
		}
		return User{}, database.ClassifyReadError(err)
	}

	if _, err = tx.Exec(ctx,
		"INSERT INTO marketplace.sessions(user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
		user.ID, digest, expiry); err != nil {
		return User{}, database.ClassifyReadError(err)
	}
	if err = tx.Commit(ctx); err != nil {
		return User{}, database.ClassifyReadError(err)
	}
	return user, nil
}

func (r *Repository) FindPassword(ctx context.Context, email string) (User, string, error) {
	var user User
	var passwordHash string
	err := r.pool.QueryRow(ctx,
		"SELECT id::text, email, display_name, password_hash FROM marketplace.users WHERE email = $1",
		email).Scan(&user.ID, &user.Email, &user.DisplayName, &passwordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, "", ErrUnauthorized
	}
	if err != nil {
		return User{}, "", database.ClassifyReadError(err)
	}
	return user, passwordHash, nil
}

// Serializing session creation on the buyer row bounds active sessions even
// when several login requests arrive concurrently. It also prunes stale sessions.
func (r *Repository) CreateSession(ctx context.Context, userID string, digest []byte, expiry time.Time) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return database.ClassifyReadError(err)
	}
	defer tx.Rollback(ctx)

	var lockedID string
	err = tx.QueryRow(ctx, "SELECT id::text FROM marketplace.users WHERE id=$1 FOR UPDATE", userID).Scan(&lockedID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrUnauthorized
	}
	if err != nil {
		return database.ClassifyReadError(err)
	}
	if _, err := tx.Exec(ctx, "DELETE FROM marketplace.sessions WHERE user_id=$1 AND expires_at<=now()", userID); err != nil {
		return database.ClassifyReadError(err)
	}
	// Retain at most four existing sessions; adding the new one brings the cap to five.
	_, err = tx.Exec(ctx, `DELETE FROM marketplace.sessions
		WHERE id IN (
			SELECT id FROM marketplace.sessions WHERE user_id=$1
			ORDER BY created_at DESC, id DESC OFFSET 4
		)`, userID)
	if err != nil {
		return database.ClassifyReadError(err)
	}
	if _, err := tx.Exec(ctx,
		"INSERT INTO marketplace.sessions(user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
		userID, digest, expiry); err != nil {
		return database.ClassifyReadError(err)
	}
	return database.ClassifyReadError(tx.Commit(ctx))
}

func (r *Repository) FindSession(ctx context.Context, digest []byte) (User, error) {
	var user User
	err := r.pool.QueryRow(ctx,
		"SELECT u.id::text, u.email, u.display_name FROM marketplace.sessions s JOIN marketplace.users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()",
		digest).Scan(&user.ID, &user.Email, &user.DisplayName)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUnauthorized
	}
	if err != nil {
		return User{}, database.ClassifyReadError(err)
	}
	return user, nil
}

func (r *Repository) DeleteSession(ctx context.Context, digest []byte) error {
	_, err := r.pool.Exec(ctx, "DELETE FROM marketplace.sessions WHERE token_hash = $1", digest)
	return database.ClassifyReadError(err)
}
