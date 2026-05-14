// Package worker — expiry_sweeper.go
//
// Hourly sweeper that ages two classes of pending rows past their stated
// grace/expiry windows into terminal states so the surrounding APIs don't
// leak stale "still actionable" UI.
//
// Two independent sweeps in one ticker (cheap — two UPDATEs):
//
//  1. tenant_domain_migrations — status='offered' AND expires_at < NOW()
//     flips to 'expired'. The admin force-migrate path already reads this
//     state (see MigrationService.Force); users hitting the public
//     accept/decline endpoints with an expired row get 410 via
//     ErrMigrationExpired already, but the row stays 'offered' without
//     this sweep — the admin UI then shows them as still pending.
//
//  2. memberships — invitation_token IS NOT NULL AND invitation_expires < NOW()
//     AND joined_at IS NULL AND deleted_at IS NULL flips invitation_token
//     to NULL. The row itself stays (admin can resend by re-invoking
//     POST /memberships which rotates the token); clearing the hash just
//     closes the stolen-link attack window on the issued URL.
//
// Failure to sweep isn't fatal — the public endpoints still enforce
// expiry at read time. This is an eventual-consistency cleaner.
package worker

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

// ExpirySweeperWorker runs the two sweeps on a fixed cadence. Interval
// defaults to 1 hour — frequent enough that admin dashboards reflect
// reality within the SLA a human would expect, rare enough that the
// UPDATEs never matter for DB load.
type ExpirySweeperWorker struct {
	pool     *pgxpool.Pool
	interval time.Duration
	log      zerolog.Logger
}

// NewExpirySweeperWorker constructs the worker.
func NewExpirySweeperWorker(pool *pgxpool.Pool, interval time.Duration, log zerolog.Logger) *ExpirySweeperWorker {
	if interval == 0 {
		interval = 1 * time.Hour
	}
	return &ExpirySweeperWorker{
		pool:     pool,
		interval: interval,
		log:      log.With().Str("component", "expiry_sweeper").Logger(),
	}
}

// Start blocks until ctx is cancelled. Runs a sweep ~30s after boot so a
// fresh deploy doesn't carry stale rows into its first admin page load,
// then every `interval` thereafter. Errors never kill the loop.
func (w *ExpirySweeperWorker) Start(ctx context.Context) {
	w.log.Info().Dur("interval", w.interval).Msg("expiry sweeper started")

	// Short warm-up so /healthz probes don't race a heavy first sweep.
	select {
	case <-ctx.Done():
		return
	case <-time.After(30 * time.Second):
	}

	tick := time.NewTicker(w.interval)
	defer tick.Stop()
	w.runOnce(ctx)
	for {
		select {
		case <-ctx.Done():
			w.log.Info().Msg("expiry sweeper stopping")
			return
		case <-tick.C:
			w.runOnce(ctx)
		}
	}
}

func (w *ExpirySweeperWorker) runOnce(ctx context.Context) {
	sweepCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Migration offers.
	migRows, err := w.pool.Exec(sweepCtx, `
		UPDATE tenant_domain_migrations
		SET status = 'expired'
		WHERE status = 'offered' AND expires_at < NOW()
	`)
	if err != nil {
		w.log.Warn().Err(err).Msg("migration expiry sweep failed")
	}

	// Pending invitations — clear the token hash (the URL becomes a 410
	// from this point on even before the row's invitation_expires is
	// also in the past). Keep the row around so admins see the history.
	invRows, err := w.pool.Exec(sweepCtx, `
		UPDATE memberships
		SET invitation_token = NULL, updated_at = NOW()
		WHERE invitation_token IS NOT NULL
		  AND invitation_expires < NOW()
		  AND joined_at IS NULL
		  AND deleted_at IS NULL
	`)
	if err != nil {
		w.log.Warn().Err(err).Msg("invitation expiry sweep failed")
	}

	w.log.Info().
		Int64("migrations_expired", safeRows(migRows)).
		Int64("invitations_swept", safeRows(invRows)).
		Msg("expiry sweep tick")
}

// safeRows returns RowsAffected from a pgconn.CommandTag, guarding against
// a nil/zero tag when the surrounding Exec errored before updating.
func safeRows(tag interface{ RowsAffected() int64 }) int64 {
	if tag == nil {
		return 0
	}
	return tag.RowsAffected()
}
