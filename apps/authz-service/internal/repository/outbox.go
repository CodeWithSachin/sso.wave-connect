package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wave-connect/sso-platform/apps/authz-service/internal/model"
)

// OutboxRepository handles CRUD for the authz_outbox table.
type OutboxRepository struct {
	pool *pgxpool.Pool
}

// NewOutboxRepository creates a new outbox repository.
func NewOutboxRepository(pool *pgxpool.Pool) *OutboxRepository {
	return &OutboxRepository{pool: pool}
}

// FetchUnprocessed retrieves unprocessed outbox entries up to the given limit,
// ordered by creation time. It uses SELECT ... FOR UPDATE SKIP LOCKED to allow
// concurrent workers without contention.
func (r *OutboxRepository) FetchUnprocessed(ctx context.Context, limit int) ([]model.OutboxEntry, error) {
	const q = `
		SELECT id, tenant_id, operation_type, tuple_user, tuple_relation, tuple_object,
		       idempotency_key, created_at, retry_count
		FROM authz_outbox
		WHERE processed_at IS NULL AND retry_count < 5
		ORDER BY created_at ASC
		LIMIT $1
		FOR UPDATE SKIP LOCKED
	`

	rows, err := r.pool.Query(ctx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("query outbox: %w", err)
	}
	defer rows.Close()

	var entries []model.OutboxEntry
	for rows.Next() {
		var e model.OutboxEntry
		if err := rows.Scan(
			&e.ID, &e.TenantID, &e.OperationType, &e.TupleUser,
			&e.TupleRelation, &e.TupleObject, &e.IdempotencyKey,
			&e.CreatedAt, &e.RetryCount,
		); err != nil {
			return nil, fmt.Errorf("scan outbox entry: %w", err)
		}
		entries = append(entries, e)
	}

	return entries, rows.Err()
}

// MarkProcessed marks an outbox entry as successfully processed.
func (r *OutboxRepository) MarkProcessed(ctx context.Context, id string) error {
	const q = `UPDATE authz_outbox SET processed_at = $1 WHERE id = $2`
	now := time.Now().UTC()
	_, err := r.pool.Exec(ctx, q, now, id)
	if err != nil {
		return fmt.Errorf("mark processed: %w", err)
	}
	return nil
}

// MarkFailed increments the retry count and stores the error.
func (r *OutboxRepository) MarkFailed(ctx context.Context, id string, errMsg string) error {
	const q = `UPDATE authz_outbox SET retry_count = retry_count + 1, error = $1 WHERE id = $2`
	_, err := r.pool.Exec(ctx, q, errMsg, id)
	if err != nil {
		return fmt.Errorf("mark failed: %w", err)
	}
	return nil
}

// CleanProcessed removes processed entries older than the given duration.
func (r *OutboxRepository) CleanProcessed(ctx context.Context, olderThan time.Duration) (int64, error) {
	const q = `DELETE FROM authz_outbox WHERE processed_at IS NOT NULL AND processed_at < $1`
	cutoff := time.Now().UTC().Add(-olderThan)
	tag, err := r.pool.Exec(ctx, q, cutoff)
	if err != nil {
		return 0, fmt.Errorf("clean processed: %w", err)
	}
	return tag.RowsAffected(), nil
}
