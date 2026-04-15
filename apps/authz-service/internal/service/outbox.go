package service

import (
	"context"
	"time"

	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/authz-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/repository"
)

// OutboxWorker drains the authz_outbox table and writes tuples to OpenFGA.
type OutboxWorker struct {
	repo         *repository.OutboxRepository
	authz        *AuthzService
	pollInterval time.Duration
	batchSize    int
	log          zerolog.Logger
}

// NewOutboxWorker creates a new outbox worker.
func NewOutboxWorker(
	repo *repository.OutboxRepository,
	authz *AuthzService,
	pollInterval time.Duration,
	batchSize int,
	log zerolog.Logger,
) *OutboxWorker {
	return &OutboxWorker{
		repo:         repo,
		authz:        authz,
		pollInterval: pollInterval,
		batchSize:    batchSize,
		log:          log.With().Str("component", "outbox-worker").Logger(),
	}
}

// Start begins the outbox draining loop. It blocks until the context is cancelled.
func (w *OutboxWorker) Start(ctx context.Context) {
	w.log.Info().
		Dur("poll_interval", w.pollInterval).
		Int("batch_size", w.batchSize).
		Msg("outbox worker started")

	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			w.log.Info().Msg("outbox worker stopping")
			return
		case <-ticker.C:
			w.drain(ctx)
		}
	}
}

func (w *OutboxWorker) drain(ctx context.Context) {
	entries, err := w.repo.FetchUnprocessed(ctx, w.batchSize)
	if err != nil {
		w.log.Error().Err(err).Msg("failed to fetch outbox entries")
		return
	}

	if len(entries) == 0 {
		return
	}

	w.log.Debug().Int("count", len(entries)).Msg("processing outbox entries")

	for _, entry := range entries {
		if err := w.processEntry(ctx, entry); err != nil {
			w.log.Error().Err(err).
				Str("id", entry.ID).
				Str("op", entry.Operation).
				Msg("failed to process outbox entry")

			if markErr := w.repo.MarkFailed(ctx, entry.ID, err.Error()); markErr != nil {
				w.log.Error().Err(markErr).Str("id", entry.ID).Msg("failed to mark entry as failed")
			}
			continue
		}

		if err := w.repo.MarkProcessed(ctx, entry.ID); err != nil {
			w.log.Error().Err(err).Str("id", entry.ID).Msg("failed to mark entry as processed")
		}
	}
}

func (w *OutboxWorker) processEntry(ctx context.Context, entry model.OutboxEntry) error {
	tuple := model.TupleWrite{
		User:     entry.TupleUser,
		Relation: entry.TupleRelation,
		Object:   entry.TupleObject,
	}

	switch entry.Operation {
	case "write":
		return w.authz.WriteTuples(ctx, []model.TupleWrite{tuple})
	case "delete":
		return w.authz.DeleteTuples(ctx, []model.TupleWrite{tuple})
	default:
		w.log.Warn().
			Str("id", entry.ID).
			Str("op", entry.Operation).
			Msg("unknown outbox operation type, skipping")
		return nil
	}
}
