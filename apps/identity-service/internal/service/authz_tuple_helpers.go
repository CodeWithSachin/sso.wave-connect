// Package service — authz_tuple_helpers.go
//
// Small DRY helpers for signup / signup-org / migration flows to enqueue the
// OpenFGA tuple writes that shadow each membership insert or delete. Living
// in their own file so the signup files stay focused on the main path.
//
// Convention (openfga/model.fga):
//   tuple_user     = "user:<user_uuid>"
//   tuple_object   = "organization:<tenant_uuid>"
//   tuple_relation ∈ { "owner", "admin", "member" }
//
// Idempotency keys name the membership and operation so retries of the same
// signup don't create duplicate outbox rows (UNIQUE enforces this).
package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

// enqueueOwnerTuple enqueues a `user:<uid> owner organization:<tid>` write.
// Called on each signup that creates an owner membership. No-ops gracefully
// if the repo is nil (dev convenience) or if fetching the store_id fails —
// the membership commit is the source of truth and we want a tuple gap to
// be recoverable, not a hard signup failure.
func enqueueOwnerTuple(
	ctx context.Context,
	tx pgx.Tx,
	repo *repository.AuthzOutboxRepository,
	tenantID, userID, membershipID uuid.UUID,
) error {
	return enqueueRoleTuple(ctx, tx, repo, tenantID, userID, membershipID, "owner")
}

// enqueueRoleTuple is the role-generic variant of enqueueOwnerTuple.
// ProvisionFederated (Slice 2 JIT) uses this with the IdP's `default_role`
// — typically "member", but configurable per IdP. The role is included
// in the idempotency key so a downgrade / upgrade doesn't collide with
// the prior tuple's outbox row.
func enqueueRoleTuple(
	ctx context.Context,
	tx pgx.Tx,
	repo *repository.AuthzOutboxRepository,
	tenantID, userID, membershipID uuid.UUID,
	role string,
) error {
	if repo == nil {
		return nil
	}
	storeID, err := repository.TenantStoreIDTx(ctx, tx, tenantID)
	if err != nil {
		return fmt.Errorf("fetch openfga store id: %w", err)
	}
	return repo.EnqueueTx(ctx, tx, repository.AuthzOutboxEntry{
		TenantID:       tenantID,
		StoreID:        storeID,
		Operation:      repository.AuthzOpWrite,
		TupleUser:      repository.BuildUserRef(userID),
		TupleRelation:  role,
		TupleObject:    repository.BuildOrgRef(tenantID),
		IdempotencyKey: fmt.Sprintf("membership:%s:%s:write", membershipID, role),
		Source:         repository.AuthzSourceSystem,
	})
}

// enqueueMigrationTupleMove enqueues BOTH sides of a Phase 4 membership move:
// delete the old role tuple on the personal tenant and write a new `member`
// tuple on the org tenant. actorID names the user initiating the move — for
// Accept that's the user themselves; for Force it's the org admin who
// triggered the force-move.
//
// `fromRole` is the relation currently held on the personal tenant —
// looked up by the caller before the membership is deleted. Historically
// always "owner" (personal tenants only have owners), but threading it
// through means a future non-owner move won't silently leave a stale tuple.
//
// The delete is best-effort against OpenFGA: if the original signup never
// wrote an owner tuple (pre-authz_outbox-parity data), the reconciler will
// no-op the delete. Writing both anyway keeps the model eventually
// consistent regardless of history.
func enqueueMigrationTupleMove(
	ctx context.Context,
	tx pgx.Tx,
	repo *repository.AuthzOutboxRepository,
	migrationID, userID, fromTenantID, toTenantID uuid.UUID,
	fromRole string,
	actorID *uuid.UUID,
) error {
	if repo == nil {
		return nil
	}
	if fromRole == "" {
		// Defensive default — caller should always supply, but if they
		// don't, "owner" matches the historical invariant for personal
		// tenants and keeps the delete meaningful rather than silently
		// skipped.
		fromRole = "owner"
	}
	fromStore, err := repository.TenantStoreIDTx(ctx, tx, fromTenantID)
	if err != nil {
		return fmt.Errorf("fetch from-tenant store id: %w", err)
	}
	toStore, err := repository.TenantStoreIDTx(ctx, tx, toTenantID)
	if err != nil {
		return fmt.Errorf("fetch to-tenant store id: %w", err)
	}

	if err := repo.EnqueueTx(ctx, tx, repository.AuthzOutboxEntry{
		TenantID:       fromTenantID,
		StoreID:        fromStore,
		Operation:      repository.AuthzOpDelete,
		TupleUser:      repository.BuildUserRef(userID),
		TupleRelation:  fromRole,
		TupleObject:    repository.BuildOrgRef(fromTenantID),
		IdempotencyKey: fmt.Sprintf("migration:%s:%s:delete", migrationID, fromRole),
		ActorUserID:    actorID,
		Source:         repository.AuthzSourceSystem,
	}); err != nil {
		return err
	}
	return repo.EnqueueTx(ctx, tx, repository.AuthzOutboxEntry{
		TenantID:       toTenantID,
		StoreID:        toStore,
		Operation:      repository.AuthzOpWrite,
		TupleUser:      repository.BuildUserRef(userID),
		TupleRelation:  "member",
		TupleObject:    repository.BuildOrgRef(toTenantID),
		IdempotencyKey: fmt.Sprintf("migration:%s:member:write", migrationID),
		ActorUserID:    actorID,
		Source:         repository.AuthzSourceSystem,
	})
}
