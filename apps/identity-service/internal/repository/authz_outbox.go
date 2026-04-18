// Package repository — authz_outbox.go
//
// Identity-service's side of the OpenFGA authz-outbox pattern (migration
// 000012). Pairs each membership INSERT/DELETE with a matching tuple
// operation so authz-service's background worker can reconcile OpenFGA.
//
// Prior to this file, identity-service never wrote tuples — signup/signup-org
// flows created memberships without corresponding `user:<uid> role
// organization:<tid>` tuples, and Phase 4 migration moves inherited the same
// gap. admin-api writes tuples correctly via its own code path
// (apps/admin-api/src/memberships/memberships.service.ts); this brings the Go
// side up to parity.
//
// Design:
//   - EnqueueTx is the only public path — tuple writes belong in the same
//     transaction as the membership row they describe. A pool-level variant
//     is deliberately omitted to keep the invariant visible.
//   - StoreID comes from `tenants.openfga_store_id`. The admin-api treats
//     empty as acceptable (string coalesce to ''); we mirror that so a
//     tenant whose store hasn't been provisioned yet doesn't fail signup.
package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// AuthzOutboxOperation is the tuple write vs delete discriminator. Must
// match the CHECK constraint on authz_outbox.operation.
type AuthzOutboxOperation string

const (
	AuthzOpWrite  AuthzOutboxOperation = "write"
	AuthzOpDelete AuthzOutboxOperation = "delete"
)

// AuthzOutboxSource matches the CHECK constraint on authz_outbox.source.
// 'system' is used when identity-service itself is initiating the write
// (signup flows, post-claim migration worker). 'api' is used when the write
// is the direct result of a user-facing API call.
type AuthzOutboxSource string

const (
	AuthzSourceAPI    AuthzOutboxSource = "api"
	AuthzSourceSystem AuthzOutboxSource = "system"
)

// AuthzOutboxEntry describes one tuple write to enqueue. TenantID + StoreID
// come from the tenant row; the tuple triple (User, Relation, Object)
// follows the `user:<uuid>` / `organization:<uuid>` convention from
// openfga/model.fga.
type AuthzOutboxEntry struct {
	TenantID       uuid.UUID
	StoreID        string
	Operation      AuthzOutboxOperation
	TupleUser      string
	TupleRelation  string
	TupleObject    string
	IdempotencyKey string
	ActorUserID    *uuid.UUID
	Source         AuthzOutboxSource

	// Optional conditional tuple — rarely used in this codebase, but the
	// column exists so we accept it here for completeness.
	ConditionName string
	ConditionCtx  map[string]any
}

// AuthzOutboxRepository owns INSERTs into the authz_outbox table. Reads are
// owned by authz-service; identity-service only writes.
type AuthzOutboxRepository struct{}

// NewAuthzOutboxRepository is trivial — state-free, a package-level function
// would suffice but a receiver keeps dependency injection consistent.
func NewAuthzOutboxRepository() *AuthzOutboxRepository {
	return &AuthzOutboxRepository{}
}

// EnqueueTx inserts one tuple-change row inside the caller's transaction.
// The UNIQUE constraint on idempotency_key protects against duplicate
// inserts on retry; callers should pick a key that names the underlying
// operation (e.g. `membership:<uuid>:owner:write`).
func (r *AuthzOutboxRepository) EnqueueTx(ctx context.Context, tx pgx.Tx, e AuthzOutboxEntry) error {
	if e.TupleUser == "" || e.TupleRelation == "" || e.TupleObject == "" {
		return fmt.Errorf("authz_outbox: tuple triple must be non-empty")
	}
	if e.IdempotencyKey == "" {
		return fmt.Errorf("authz_outbox: idempotency_key is required")
	}
	if e.Source == "" {
		e.Source = AuthzSourceSystem
	}
	var ctxJSON []byte
	if len(e.ConditionCtx) > 0 {
		var err error
		ctxJSON, err = json.Marshal(e.ConditionCtx)
		if err != nil {
			return fmt.Errorf("marshal condition_ctx: %w", err)
		}
	}

	const q = `INSERT INTO authz_outbox
		(tenant_id, store_id, operation, tuple_user, tuple_relation, tuple_object,
		 condition_name, condition_ctx, idempotency_key, actor_user_id, source)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7,''), $8::jsonb, $9, $10, $11)`
	if _, err := tx.Exec(ctx, q,
		e.TenantID, e.StoreID, string(e.Operation),
		e.TupleUser, e.TupleRelation, e.TupleObject,
		e.ConditionName, ctxJSON,
		e.IdempotencyKey, e.ActorUserID, string(e.Source),
	); err != nil {
		return fmt.Errorf("insert authz_outbox: %w", err)
	}
	return nil
}

// TenantStoreIDTx fetches the openfga_store_id for a tenant inside a tx.
// Returns empty string (not an error) when the column is NULL — signup
// flows run before the per-tenant store is provisioned and we want to
// queue the tuple anyway so the reconciler can backfill.
func TenantStoreIDTx(ctx context.Context, tx pgx.Tx, tenantID uuid.UUID) (string, error) {
	var storeID *string
	if err := tx.QueryRow(ctx, `SELECT openfga_store_id FROM tenants WHERE id = $1`, tenantID).Scan(&storeID); err != nil {
		return "", fmt.Errorf("lookup openfga_store_id: %w", err)
	}
	if storeID == nil {
		return "", nil
	}
	return *storeID, nil
}

// BuildUserRef / BuildOrgRef centralize the string-format invariants from
// openfga/model.fga so callers can't drift.
func BuildUserRef(userID uuid.UUID) string {
	return "user:" + userID.String()
}

// BuildOrgRef renders a tenant as the `organization:<uuid>` FGA object.
// Every tenant (personal or organization) maps to this type per model.fga.
func BuildOrgRef(tenantID uuid.UUID) string {
	return "organization:" + tenantID.String()
}
