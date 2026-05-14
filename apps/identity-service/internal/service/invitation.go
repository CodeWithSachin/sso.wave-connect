// Package service — invitation.go
//
// Phase 6 tenant-invitation accept/decline. Paired entry points:
//
//	Lookup  — token → { tenant name, role, invited email, needsPasswordSetup }
//	Accept  — token (+ password + display_name for new users) → membership
//	          activated, FGA tuple queued, session minted.
//	Decline — token → membership soft-deleted.
//
// Accept fans out into two shapes depending on whether the invited user
// already had a password:
//
//   - Existing user → just activate the membership + mint a session.
//   - First-time user (admin-api created a placeholder) → additionally
//     hash their chosen password, flip status to 'active', flip
//     email_verified to TRUE (the invite click proves ownership).
//
// All DB mutations happen in one transaction so a crash mid-flow never
// leaves the membership half-accepted. Authz_outbox tuple writes are
// enqueued in the same tx (migration 000012 outbox pattern) so the
// authz-service reconciler picks up the role tuple atomically with the
// membership row.
package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

// ErrInvitationPasswordRequired — the invited user has no password on file
// and the client didn't supply one. Handler maps to 422.
var ErrInvitationPasswordRequired = errors.New("invitation requires password setup")

// ErrInvitationPasswordNotAllowed — the invited user already has a
// password (they signed up previously) but the client supplied one
// anyway. Reject to avoid silently overwriting. Handler maps to 409.
var ErrInvitationPasswordNotAllowed = errors.New("invitation does not permit password change")

// InvitationService wraps accept/decline/lookup orchestration.
type InvitationService struct {
	pool            *pgxpool.Pool
	invRepo         *repository.MembershipInvitationRepository
	sessionSvc      *SessionService
	passwordSvc     *PasswordService
	authzOutboxRepo *repository.AuthzOutboxRepository
	outbox          *event.Outbox
	log             zerolog.Logger
}

// InvitationServiceDeps bundles wiring.
type InvitationServiceDeps struct {
	Pool            *pgxpool.Pool
	InvitationRepo  *repository.MembershipInvitationRepository
	SessionSvc      *SessionService
	PasswordSvc     *PasswordService
	AuthzOutboxRepo *repository.AuthzOutboxRepository
	Outbox          *event.Outbox
	Log             zerolog.Logger
}

// NewInvitationService constructs the service.
func NewInvitationService(deps InvitationServiceDeps) *InvitationService {
	return &InvitationService{
		pool:            deps.Pool,
		invRepo:         deps.InvitationRepo,
		sessionSvc:      deps.SessionSvc,
		passwordSvc:     deps.PasswordSvc,
		authzOutboxRepo: deps.AuthzOutboxRepo,
		outbox:          deps.Outbox,
		log:             deps.Log.With().Str("component", "invitation_service").Logger(),
	}
}

// InvitationLookupResult is the shape returned by GET /auth/public/invitation/:token.
// Deliberately minimal: just enough for the UI to render the accept page.
// Does NOT include internal IDs beyond what a legitimate invitee could
// already infer from their email + the invited tenant's branding.
type InvitationLookupResult struct {
	TenantName           string
	TenantDisplayName    string
	Role                 string
	InvitedEmail         string
	NeedsPasswordSetup   bool
	ExpiresAt            time.Time
}

// Lookup validates the token + returns UI-facing offer metadata.
func (s *InvitationService) Lookup(ctx context.Context, rawToken string) (*InvitationLookupResult, error) {
	inv, err := s.invRepo.FindPendingByToken(ctx, rawToken)
	if err != nil {
		return nil, err
	}
	return &InvitationLookupResult{
		TenantName:         inv.TenantName,
		TenantDisplayName:  inv.TenantDisplayName,
		Role:               inv.Role,
		InvitedEmail:       inv.UserEmail,
		NeedsPasswordSetup: !inv.UserHasPassword,
		ExpiresAt:          inv.ExpiresAt,
	}, nil
}

// AcceptRequest is the payload for POST /auth/public/invitation/:token/accept.
//
//	Password     — required iff the user has no password (first-time invite).
//	               ≥10 chars per the codebase's existing rule.
//	DisplayName  — optional override; only applied on first-time accept.
type AcceptRequest struct {
	Password    string `json:"password"    validate:"omitempty,min=10,max=128"`
	DisplayName string `json:"display_name" validate:"omitempty,min=1,max=100"`
}

// AcceptResult carries the UI-facing outcome + a session for the accepted user.
type AcceptResult struct {
	TenantID    uuid.UUID
	TenantName  string
	UserID      uuid.UUID
	Session     *model.Session
}

// Accept runs the full activation flow in one transaction. Returns a
// freshly-minted session so the login-portal can set the sso_session cookie
// and drop the user straight into the tenant without a second round-trip
// through /auth/login.
func (s *InvitationService) Accept(ctx context.Context, rawToken string, req AcceptRequest, ip, ua string) (*AcceptResult, error) {
	inv, err := s.invRepo.FindPendingByToken(ctx, rawToken)
	if err != nil {
		return nil, err
	}

	// Pre-tx validation: password semantics. Doing this here so we fail
	// fast without opening a tx we'd immediately roll back.
	switch {
	case !inv.UserHasPassword && req.Password == "":
		return nil, ErrInvitationPasswordRequired
	case inv.UserHasPassword && req.Password != "":
		return nil, ErrInvitationPasswordNotAllowed
	}

	// Hash the password BEFORE the tx — argon2 is CPU-heavy and holding a
	// DB transaction open during hashing wastes a connection. Safe
	// because the hash is self-contained; we write it inside the tx below.
	var passwordHash string
	if !inv.UserHasPassword {
		h, hashErr := s.passwordSvc.Hash(req.Password)
		if hashErr != nil {
			return nil, fmt.Errorf("hash invite password: %w", hashErr)
		}
		passwordHash = h
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin accept tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	// 1. Stamp the membership as accepted (clears token + sets joined_at).
	if err := s.invRepo.AcceptTx(ctx, tx, inv.MembershipID); err != nil {
		return nil, err
	}

	// 2. First-time user: set password + flip status/email_verified. This
	//    runs AFTER AcceptTx so a concurrent decline/expiry detected there
	//    short-circuits us out before we mutate the user row.
	if !inv.UserHasPassword {
		if err := s.invRepo.SetPasswordAndActivateTx(ctx, tx, inv.UserID, passwordHash, req.DisplayName); err != nil {
			return nil, err
		}
	}

	// 3. FGA tuple: the invited user now has `role` on organization:<tid>.
	//    The authz-service reconciler picks this up; until it does, the
	//    user has the membership in the DB but no ReBAC access. Acceptable
	//    eventual-consistency trade-off matching admin-api's pattern.
	if s.authzOutboxRepo != nil {
		tenantStoreID, err := repository.TenantStoreIDTx(ctx, tx, inv.TenantID)
		if err != nil {
			return nil, fmt.Errorf("lookup tenant store id: %w", err)
		}
		if err := s.authzOutboxRepo.EnqueueTx(ctx, tx, repository.AuthzOutboxEntry{
			TenantID:       inv.TenantID,
			StoreID:        tenantStoreID,
			Operation:      repository.AuthzOpWrite,
			TupleUser:      repository.BuildUserRef(inv.UserID),
			TupleRelation:  inv.Role,
			TupleObject:    repository.BuildOrgRef(inv.TenantID),
			IdempotencyKey: fmt.Sprintf("membership:%s:%s:accept", inv.MembershipID, inv.Role),
			ActorUserID:    &inv.UserID,
			Source:         repository.AuthzSourceSystem,
		}); err != nil {
			return nil, fmt.Errorf("enqueue invite tuple: %w", err)
		}
	}

	// 4. Domain event for downstream consumers (audit log, webhooks).
	if s.outbox != nil {
		now := time.Now().UTC()
		if err := s.outbox.EnqueueTx(ctx, tx, event.Event{
			Type:      event.TypeMembershipCreated,
			Timestamp: now,
			TenantID:  inv.TenantID,
			ActorID:   inv.UserID,
			Payload: map[string]any{
				"membership_id": inv.MembershipID,
				"user_id":       inv.UserID,
				"tenant_id":     inv.TenantID,
				"role":          inv.Role,
				"invited_by":    inv.InvitedBy,
				"source":        "invitation_accept",
			},
		}); err != nil {
			return nil, fmt.Errorf("enqueue membership.created: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit accept: %w", err)
	}
	committed = true

	// 5. Post-commit: mint a session anchored at the joined tenant. A
	//    session failure here doesn't un-accept the membership — the
	//    user can log in normally.
	sess, err := s.sessionSvc.Create(ctx, inv.UserID, inv.TenantID, ip, ua)
	if err != nil {
		s.log.Warn().Err(err).Msg("create session after accept failed (membership still valid)")
	}

	s.log.Info().
		Str("membership_id", inv.MembershipID.String()).
		Str("user_id", inv.UserID.String()).
		Str("tenant_id", inv.TenantID.String()).
		Str("role", inv.Role).
		Bool("first_time", !inv.UserHasPassword).
		Msg("invitation accepted")

	return &AcceptResult{
		TenantID:   inv.TenantID,
		TenantName: inv.TenantName,
		UserID:     inv.UserID,
		Session:    sess,
	}, nil
}

// Decline soft-deletes the pending membership. Not reversible — a second
// click with the same token will see the deleted_at stamp and return
// ErrInvitationAlreadyResolved. Safe to expose because the UI can show the
// same 410-gone response regardless of accept vs. decline-resolved.
func (s *InvitationService) Decline(ctx context.Context, rawToken string) error {
	inv, err := s.invRepo.FindPendingByToken(ctx, rawToken)
	if err != nil {
		return err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin decline tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	if err := s.invRepo.DeclineTx(ctx, tx, inv.MembershipID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit decline: %w", err)
	}
	committed = true
	s.log.Info().
		Str("membership_id", inv.MembershipID.String()).
		Str("user_id", inv.UserID.String()).
		Str("tenant_id", inv.TenantID.String()).
		Msg("invitation declined")
	return nil
}
