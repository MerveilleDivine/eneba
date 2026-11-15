package database

import (
	"context"
	"errors"
	"io"
	"net"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

// ClassifyReadError owns the common connection/timeout distinction for
// read-only feature repositories. Schema and query bugs remain internal errors.
func ClassifyReadError(err error) error {
	var connectionError *pgconn.ConnectError
	var networkError net.Error
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) ||
		errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) ||
		errors.As(err, &connectionError) || errors.As(err, &networkError) {
		return ErrUnavailable
	}
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) {
		if strings.HasPrefix(postgresError.Code, "08") ||
			strings.HasPrefix(postgresError.Code, "28") ||
			strings.HasPrefix(postgresError.Code, "53") {
			return ErrUnavailable
		}
		switch postgresError.Code {
		case "57014", "57P01", "57P02", "57P03":
			return ErrUnavailable
		}
	}
	return err
}
