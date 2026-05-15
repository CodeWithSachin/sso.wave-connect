//go:build integration

// Integration tests for WithTenantTx. Run with:
//   go test -tags=integration ./internal/service/...
//
// Requires a local Postgres at localhost:5433 (or DATABASE_URL override).
// Skips gracefully if the DB is unreachable.
package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func openTestPool(t *testing.T) (*pgxpool.Pool, context.Context) {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://app_readwrite:dev@localhost:5433/sso_dev?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Skipf("cannot open test DB: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("DB ping failed: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool, ctx
}

func TestWithTenantTx_SetsRLSContext_AndCommits(t *testing.T) {
	pool, ctx := openTestPool(t)
	tenantID := uuid.New()

	err := WithTenantTx(ctx, pool, tenantID, func(tx pgx.Tx) error {
		// Inside the tx, current_setting('app.current_tenant_id') should
		// return the value we passed in. This is the load-bearing assertion:
		// if the SET LOCAL didn't fire, downstream RLS-protected reads would
		// silently see no rows instead of failing loudly.
		var got string
		if err := tx.QueryRow(ctx, "SELECT current_setting('app.current_tenant_id', true)").Scan(&got); err != nil {
			return err
		}
		if got != tenantID.String() {
			t.Errorf("app.current_tenant_id: want %s, got %q", tenantID, got)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("WithTenantTx: %v", err)
	}
}

func TestWithTenantTx_RollsBackOnError(t *testing.T) {
	pool, ctx := openTestPool(t)
	tenantID := uuid.New()

	// Stage: create a scratch table inside the tx, then return an error so
	// the rollback kicks in. After rollback, the table should not exist.
	scratchName := "wtt_scratch_" + uuid.New().String()[:8]
	sentinel := errors.New("rollback me")

	err := WithTenantTx(ctx, pool, tenantID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "CREATE TEMP TABLE "+scratchName+" (id int)"); err != nil {
			return err
		}
		return sentinel
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error to propagate, got: %v", err)
	}

	// Temp tables are session-scoped (and pgx may reuse the connection);
	// outside the tx, the table either doesn't exist or, if the pool
	// returned a different conn, also doesn't exist. Either way, a SELECT
	// fails — that's the assertion we want.
	var ok bool
	queryErr := pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = $1)",
		scratchName,
	).Scan(&ok)
	if queryErr != nil {
		t.Fatalf("table existence check: %v", queryErr)
	}
	if ok {
		t.Errorf("scratch table %s should have been rolled back but still exists", scratchName)
	}
}

func TestWithTenantTx_RejectsNilPool(t *testing.T) {
	err := WithTenantTx(context.Background(), nil, uuid.New(), func(_ pgx.Tx) error { return nil })
	if err == nil {
		t.Fatal("expected error for nil pool")
	}
}

func TestWithTenantTx_RejectsZeroTenantID(t *testing.T) {
	pool, ctx := openTestPool(t)

	// uuid.Nil would silently bypass RLS policies that compare against
	// app.current_tenant_id (the empty string falls into a default branch).
	// We explicitly reject it.
	err := WithTenantTx(ctx, pool, uuid.Nil, func(_ pgx.Tx) error { return nil })
	if err == nil {
		t.Fatal("expected error for nil tenant uuid")
	}
}
