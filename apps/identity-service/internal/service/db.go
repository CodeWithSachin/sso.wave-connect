package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WithTenantTx runs `fn` inside a Postgres transaction with the tenant RLS
// context (`app.current_tenant_id`) set for the lifetime of the tx.
//
// Pattern extracted from `signup_org.go` so Milestone A Slice 2's
// `ProvisionFederated` (JIT user creation) and any future multi-write
// tenant-scoped flow can reuse the same orchestration: BEGIN → SET LOCAL →
// fn → COMMIT (or ROLLBACK on any returned error or panic).
//
// Why SET LOCAL inside the tx (not via middleware on the connection):
//   - SET LOCAL is scoped to the surrounding transaction and reverts on
//     COMMIT/ROLLBACK, even on a pooled connection. This is safer than
//     SET SESSION + a connection-level middleware: a panic that bypasses
//     the middleware's cleanup hook can leak the tenant_id onto the next
//     borrower of the same conn. SET LOCAL has no such failure mode.
//   - Makes the helper self-contained: callers from any code path get RLS
//     right without depending on the request-scoped middleware running first.
//
// `fn` receives the pgx.Tx directly — keep your repository calls on `tx`,
// not on the pool, otherwise the writes skip the RLS context and may be
// rejected by row-level policies.
func WithTenantTx(ctx context.Context, pool *pgxpool.Pool, tenantID uuid.UUID, fn func(pgx.Tx) error) (err error) {
	if pool == nil {
		return errors.New("WithTenantTx: nil pool")
	}
	if tenantID == uuid.Nil {
		return errors.New("WithTenantTx: tenant_id is required (zero UUID would silently bypass RLS)")
	}

	tx, beginErr := pool.BeginTx(ctx, pgx.TxOptions{})
	if beginErr != nil {
		return fmt.Errorf("begin tx: %w", beginErr)
	}

	// Defer rollback. A successful Commit makes Rollback a no-op
	// (`pgx.ErrTxClosed`), which we intentionally swallow. Panics propagate
	// after rollback so the caller can recover or crash as desired.
	committed := false
	defer func() {
		if committed {
			return
		}
		if rbErr := tx.Rollback(ctx); rbErr != nil && !errors.Is(rbErr, pgx.ErrTxClosed) {
			// Don't shadow the original fn error — combine via wrap.
			if err != nil {
				err = fmt.Errorf("%w (additionally: rollback failed: %v)", err, rbErr)
			} else {
				err = fmt.Errorf("rollback failed: %w", rbErr)
			}
		}
	}()

	// SET LOCAL — RLS policies on tenant-scoped tables read this via
	// current_setting('app.current_tenant_id', true). Postgres rejects
	// bind parameters on SET, so we inline the UUID; this is safe because
	// uuid.UUID.String() is constrained to `[0-9a-f-]{36}` — no SQL-
	// injection surface. The earlier check rejects uuid.Nil so an empty
	// string can't slip through.
	if _, err = tx.Exec(ctx, "SET LOCAL app.current_tenant_id = '"+tenantID.String()+"'"); err != nil {
		return fmt.Errorf("set tenant RLS context: %w", err)
	}

	if err = fn(tx); err != nil {
		return err
	}

	if commitErr := tx.Commit(ctx); commitErr != nil {
		return fmt.Errorf("commit tx: %w", commitErr)
	}
	committed = true
	return nil
}
