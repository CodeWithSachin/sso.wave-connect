// Package worker houses background goroutines that run alongside the HTTP
// and gRPC servers. Each worker is a standalone type with Start/Stop lifecycle
// so main.go composes them the same way as services.
package worker

import (
	"context"
	"time"

	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

// DomainVerifyWorker polls pending `tenant_domains` rows and runs each
// through DomainVerifyService.CheckPending on a fixed interval. Simple
// single-loop design: concurrency is handled INSIDE the service (via its
// per-row context + bounded batch size), not in the scheduler. Keeping the
// scheduler dumb makes it trivial to add more jobs later without rewriting
// this layer.
type DomainVerifyWorker struct {
	svc      *service.DomainVerifyService
	interval time.Duration
	batch    int
	log      zerolog.Logger
}

// NewDomainVerifyWorker constructs the worker.
//
//	interval — how often to scan for pending rows (plan default: 10 min).
//	batch    — max rows per scan (plan default: 200).
func NewDomainVerifyWorker(svc *service.DomainVerifyService, interval time.Duration, batch int, log zerolog.Logger) *DomainVerifyWorker {
	if interval == 0 {
		interval = 10 * time.Minute
	}
	if batch == 0 {
		batch = 200
	}
	return &DomainVerifyWorker{
		svc:      svc,
		interval: interval,
		batch:    batch,
		log:      log.With().Str("component", "domain_verify_worker").Logger(),
	}
}

// Start blocks until ctx is cancelled. First tick fires immediately after a
// short warm-up so a fresh deploy doesn't wait 10 minutes before checking
// anything. Errors from CheckPending are logged but never returned — worker
// loops should keep ticking even after a transient DB blip.
func (w *DomainVerifyWorker) Start(ctx context.Context) {
	w.log.Info().Dur("interval", w.interval).Int("batch", w.batch).Msg("domain verify worker started")

	// Short initial delay so whatever bootstrap is happening in main.go
	// (connection pool warm-up, NATS) is done before we start hammering DNS.
	select {
	case <-ctx.Done():
		return
	case <-time.After(15 * time.Second):
	}

	tick := time.NewTicker(w.interval)
	defer tick.Stop()

	w.runOnce(ctx)
	for {
		select {
		case <-ctx.Done():
			w.log.Info().Msg("domain verify worker stopping")
			return
		case <-tick.C:
			w.runOnce(ctx)
		}
	}
}

func (w *DomainVerifyWorker) runOnce(ctx context.Context) {
	// Each tick has its own context with a generous deadline so a hung resolver
	// for one row can't freeze the next tick.
	tickCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	started := time.Now()
	if err := w.svc.CheckPending(tickCtx, w.batch); err != nil {
		w.log.Warn().Err(err).Msg("check pending failed")
		return
	}
	w.log.Debug().Dur("duration", time.Since(started)).Msg("domain verify tick complete")
}
