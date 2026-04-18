// Package repository — membership_invitation.go
//
// Phase 6: tenant-invitation accept/decline. Reuses the existing
// `memberships` table — invitation_token (SHA-256 hex of the raw emailed
// token) and invitation_expires were added in the core identity migration
// (000003). A row is "pending" when invitation_token IS NOT NULL and
// joined_at IS NULL; the accept flow stamps joined_at, clears the token,
// and the tenant's authz_outbox tuple is written in the same transaction.
//
// admin-api writes the pending row; identity-service consumes it.
package repository

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrInvitationNotFound — token didn't match any pending invitation. Handler
// maps to 410 for all enumeration-resistant surfaces (including expired or
// already-accepted rows that we also translate here).
var ErrInvitationNotFound = errors.New("invitation not found or invalid")

// ErrInvitationAlreadyResolved — row exists but is no longer pending
// (joined_at set, soft-deleted, or token already cleared).
var ErrInvitationAlreadyResolved = errors.New("invitation already resolved")

// ErrInvitationExpired — row is pending but invitation_expires < NOW().
// Admin must resend (rotating the token) to issue a new offer.
var ErrInvitationExpired = errors.New("invitation expired")

// PendingInvitation is the projection returned by FindPendingByToken —
// carries everything Accept/Decline handlers need to (a) decide the flow
// and (b) render the UI without a follow-up round-trip.
type PendingInvitation struct {
	MembershipID      uuid.UUID
	UserID            uuid.UUID
	UserEmail         string
	UserHasPassword   bool
	UserDisplayName   string
	TenantID          uuid.UUID
	TenantName        string
	TenantDisplayName string
	Role              string
	InvitedBy         *uuid.UUID
	ExpiresAt         time.Time
}

// MembershipInvitationRepository is a read/write wrapper around the
// invitation columns on memberships. Kept separate from the broader
// MembershipRepository because the "by-token-hash" lookup is a different
// shape (needs a JOIN onto users + tenants to populate the UI payload).
type MembershipInvitationRepository struct {
	pool *pgxpool.Pool
}

// NewMembershipInvitationRepository wraps a pool.
func NewMembershipInvitationRepository(pool *pgxpool.Pool) *MembershipInvitationRepository {
	return &MembershipInvitationRepository{pool: pool}
}

// HashInvitationToken mirrors admin-api's SHA-256 digest (hex-encoded) so
// both sides of the invite round-trip agree on how to compare the raw URL
// token to the stored invitation_token column.
func HashInvitationToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// FindPendingByToken looks up a pending invitation by the SHA-256 hash of
// the raw token. Enforces both the "row is pending" and "row is not
// expired" constraints inline, so callers see distinct errors they can
// react to. Non-pending rows (joined_at set, soft-deleted) return
// ErrInvitationAlreadyResolved even though from the user's perspective
// both are "your link doesn't work" — the handler collapses both to 410.
func (r *MembershipInvitationRepository) FindPendingByToken(ctx context.Context, rawToken string) (*PendingInvitation, error) {
	tokenHash := HashInvitationToken(rawToken)
	const q = `SELECT m.id, m.user_id, u.email::text, (u.password_hash IS NOT NULL AND u.password_hash <> '') AS has_pw,
		u.display_name, m.tenant_id, t.name, t.display_name, m.role::text, m.invited_by,
		m.invitation_expires, m.joined_at, m.deleted_at, m.invitation_token
		FROM memberships m
		JOIN users u ON u.id = m.user_id
		JOIN tenants t ON t.id = m.tenant_id
		WHERE m.invitation_token = $1
		LIMIT 1`
	var (
		out           PendingInvitation
		invitedBy     *uuid.UUID
		expiresAt     *time.Time
		joinedAt      *time.Time
		deletedAt     *time.Time
		invitationTok *string
	)
	err := r.pool.QueryRow(ctx, q, tokenHash).Scan(
		&out.MembershipID, &out.UserID, &out.UserEmail, &out.UserHasPassword,
		&out.UserDisplayName, &out.TenantID, &out.TenantName, &out.TenantDisplayName,
		&out.Role, &invitedBy, &expiresAt, &joinedAt, &deletedAt, &invitationTok,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find pending invitation: %w", err)
	}
	// Sanity: if invitation_token has been cleared under our feet (race
	// with a concurrent accept) the row effectively isn't pending.
	if invitationTok == nil || *invitationTok == "" || joinedAt != nil || deletedAt != nil {
		return nil, ErrInvitationAlreadyResolved
	}
	if expiresAt == nil {
		return nil, ErrInvitationAlreadyResolved
	}
	if time.Now().After(*expiresAt) {
		return nil, ErrInvitationExpired
	}
	out.InvitedBy = invitedBy
	out.ExpiresAt = *expiresAt
	return &out, nil
}

// AcceptTx atomically stamps joined_at, clears the invitation token + expiry
// and updates the row in the caller's transaction. Expected to pair with:
//   - authz_outbox write (role tuple)
//   - optional user-side password write (for first-time-invite users)
//
// Returns ErrInvitationAlreadyResolved if a concurrent accept already
// consumed the row. Not idempotent — callers should not re-run on this
// specific transaction.
func (r *MembershipInvitationRepository) AcceptTx(ctx context.Context, tx pgx.Tx, membershipID uuid.UUID) error {
	const q = `UPDATE memberships
		SET joined_at = NOW(),
		    invitation_token = NULL,
		    invitation_expires = NULL,
		    updated_at = NOW()
		WHERE id = $1
		  AND invitation_token IS NOT NULL
		  AND joined_at IS NULL
		  AND deleted_at IS NULL`
	tag, err := tx.Exec(ctx, q, membershipID)
	if err != nil {
		return fmt.Errorf("accept invitation: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrInvitationAlreadyResolved
	}
	return nil
}

// DeclineTx soft-deletes the pending membership. Leaves the invitation_token
// in place so a second click with the same link returns "already resolved"
// rather than "invalid" — visible consistency trumps cleanup. The 14-day
// expiry guarantees eventual garbage collection.
func (r *MembershipInvitationRepository) DeclineTx(ctx context.Context, tx pgx.Tx, membershipID uuid.UUID) error {
	const q = `UPDATE memberships
		SET deleted_at = NOW(),
		    updated_at = NOW()
		WHERE id = $1
		  AND invitation_token IS NOT NULL
		  AND joined_at IS NULL
		  AND deleted_at IS NULL`
	tag, err := tx.Exec(ctx, q, membershipID)
	if err != nil {
		return fmt.Errorf("decline invitation: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrInvitationAlreadyResolved
	}
	return nil
}

// SetPasswordAndActivateTx is the "first-time-invited user" path: they
// have no password yet because admin-api created them as a placeholder.
// The accept flow calls this in the same tx as AcceptTx so password write
// + membership activation land together. No-op if the user already has a
// password (returns nil; caller should reject upstream).
//
// `passwordHash` is argon2id, computed by the service layer. We also set
// email_verified=TRUE and status='active' because accepting an invitation
// is itself proof of email ownership (the user clicked a link only they
// could have received).
func (r *MembershipInvitationRepository) SetPasswordAndActivateTx(ctx context.Context, tx pgx.Tx, userID uuid.UUID, passwordHash, displayName string) error {
	const q = `UPDATE users
		SET password_hash = $2,
		    display_name = COALESCE(NULLIF($3, ''), display_name),
		    email_verified = TRUE,
		    status = 'active',
		    updated_at = NOW()
		WHERE id = $1
		  AND (password_hash IS NULL OR password_hash = '')`
	tag, err := tx.Exec(ctx, q, userID, passwordHash, displayName)
	if err != nil {
		return fmt.Errorf("set password on invited user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		// Either user already has a password (wrong flow — handler should
		// have short-circuited) or user vanished. Both are bugs; surface.
		return ErrInvitationAlreadyResolved
	}
	return nil
}
