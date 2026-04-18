// Package service — active_tenant.go
//
// Phase 5: multi-tenant session switcher. Two operations:
//
//	ListMemberships(ctx, userID) — every tenant the user holds a membership
//	                               in. Powers the picker UI post-login.
//	SwitchActiveTenant(...)      — validate membership, flip
//	                               sessions.active_tenant_id. Does NOT
//	                               rotate the session cookie or revoke the
//	                               PASETO family; the plan explicitly calls
//	                               for cookie stability across switches and
//	                               token claims refresh at next /oauth2/token.
package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

// ErrTenantNotMember — user doesn't hold a membership in the target tenant.
// Handler maps to 403 so the UI knows it's a permission issue (vs a 404 for
// "tenant doesn't exist" — which we don't distinguish here, deliberately,
// to avoid leaking tenant existence across users).
var ErrTenantNotMember = errors.New("not a member of target tenant")

// ActiveTenantService is the Phase 5 entry point. Handles membership listing,
// active-tenant switching, and token rotation after a switch so the client
// can drop stale access tokens without waiting for their 15-min TTL.
type ActiveTenantService struct {
	membershipRepo *repository.MembershipRepository
	sessionRepo    *repository.SessionRepository
	userRepo       *repository.UserRepository
	familyRepo     *repository.RefreshFamilyRepository
	tokenSvc       *TokenService
	refreshTTL     time.Duration
	log            zerolog.Logger
}

// FirstPartyClientID is the client UUID used for platform-issued tokens
// (login, rotate). Matches migration 000016 seed — keeping this here so the
// active-tenant path doesn't have to import the auth handler's constant.
var firstPartyClientID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

// NewActiveTenantService wires the deps. Rotate-related deps (userRepo,
// familyRepo, tokenSvc) are optional — nil disables the rotate endpoint
// without breaking list/switch.
func NewActiveTenantService(
	membershipRepo *repository.MembershipRepository,
	sessionRepo *repository.SessionRepository,
	userRepo *repository.UserRepository,
	familyRepo *repository.RefreshFamilyRepository,
	tokenSvc *TokenService,
	refreshTTL time.Duration,
	log zerolog.Logger,
) *ActiveTenantService {
	return &ActiveTenantService{
		membershipRepo: membershipRepo,
		sessionRepo:    sessionRepo,
		userRepo:       userRepo,
		familyRepo:     familyRepo,
		tokenSvc:       tokenSvc,
		refreshTTL:     refreshTTL,
		log:            log.With().Str("component", "active_tenant_service").Logger(),
	}
}

// MembershipView is the response shape for GET /auth/session/memberships.
// Carries just enough for the UI to render the picker + drive a subsequent
// PATCH.
type MembershipView struct {
	TenantID    uuid.UUID `json:"tenant_id"`
	TenantSlug  string    `json:"tenant_slug"`
	TenantName  string    `json:"tenant_name"`
	TenantKind  string    `json:"tenant_kind"` // "personal" | "organization"
	Role        string    `json:"role"`        // "owner" | "admin" | "member"
	IsActive    bool      `json:"is_active"`   // matches the current session.active_tenant_id
}

// ListMemberships returns the user's tenants with the currently-active one
// marked. `activeTenantID` is the session's active tenant_id, used to set
// `IsActive` on the matching row.
func (s *ActiveTenantService) ListMemberships(ctx context.Context, userID, activeTenantID uuid.UUID) ([]MembershipView, error) {
	rows, err := s.membershipRepo.ListTenantsForUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list tenants for user: %w", err)
	}
	out := make([]MembershipView, 0, len(rows))
	for _, r := range rows {
		out = append(out, MembershipView{
			TenantID:   r.TenantID,
			TenantSlug: r.TenantSlug,
			TenantName: r.TenantName,
			TenantKind: r.TenantKind,
			Role:       r.Role,
			IsActive:   r.TenantID == activeTenantID,
		})
	}
	return out, nil
}

// SwitchActiveTenant validates the user holds a membership in targetTenantID
// and flips sessions.active_tenant_id. Idempotent: switching to the current
// active tenant is a no-op (returns the current row count untouched).
func (s *ActiveTenantService) SwitchActiveTenant(ctx context.Context, sessionID, userID, targetTenantID uuid.UUID) error {
	if _, err := s.membershipRepo.GetByUserAndTenant(ctx, userID, targetTenantID); err != nil {
		if errors.Is(err, repository.ErrMembershipNotFound) {
			return ErrTenantNotMember
		}
		return fmt.Errorf("validate membership: %w", err)
	}
	if err := s.sessionRepo.SetActiveTenant(ctx, sessionID, userID, targetTenantID); err != nil {
		return fmt.Errorf("flip session active tenant: %w", err)
	}
	s.log.Info().
		Str("user_id", userID.String()).
		Str("session_id", sessionID.String()).
		Str("to_tenant", targetTenantID.String()).
		Msg("active tenant switched")
	return nil
}

// ErrRotateUnavailable — the service was constructed without the token
// dependencies, so rotate isn't wired. Handler maps to 503.
var ErrRotateUnavailable = errors.New("token rotation not available")

// Rotate revokes the current session's refresh-token family (if tracked,
// post-000028) and mints a fresh access/refresh/id token set for the
// session's CURRENT active tenant. Called by the UI after a successful
// PATCH /auth/session/active-tenant so the access-token TTL of 15 min isn't
// the bound on how stale the tenant claim can be.
//
// Scopes the family revoke to `session_id` — revoking ALL of the user's
// families would log them out on every device, which is not what a tenant
// switch should do. Legacy families from before migration 000028 have NULL
// session_id; those stay active until their TTL (consistent trade-off).
func (s *ActiveTenantService) Rotate(ctx context.Context, sessionID, userID uuid.UUID) (*model.TokenSet, error) {
	if s.tokenSvc == nil || s.userRepo == nil || s.familyRepo == nil {
		return nil, ErrRotateUnavailable
	}

	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("load user: %w", err)
	}
	// Fresh read of the session so we mint for the current active tenant —
	// not the tenant embedded in whatever access token the client happens
	// to be holding.
	sess, err := s.sessionRepo.GetByID(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("load session: %w", err)
	}
	if sess.UserID != userID {
		return nil, ErrTenantNotMember
	}

	// Revoke the prior family tied to this session so stale refresh tokens
	// can't be replayed for the old tenant. Best-effort: non-fatal.
	if n, err := s.familyRepo.RevokeBySession(ctx, sessionID, "tenant_switch_rotation"); err != nil {
		s.log.Warn().Err(err).Msg("revoke prior session families failed")
	} else if n > 0 {
		s.log.Debug().Int("revoked", n).Str("session_id", sessionID.String()).Msg("prior families revoked on rotate")
	}

	// Mint a new family + tokens for the new active tenant.
	now := time.Now().UTC()
	familyID := uuid.New().String()
	sid := sess.ID // escape to pointer
	family := &model.RefreshTokenFamily{
		FamilyID:      familyID,
		UserID:        user.ID,
		TenantID:      sess.ActiveTenantID,
		ClientID:      firstPartyClientID,
		SessionID:     &sid,
		CurrentJTI:    uuid.New().String(),
		Generation:    0,
		IsRevoked:     false,
		CreatedAt:     now,
		LastRotatedAt: now,
		ExpiresAt:     now.Add(s.refreshTTL),
	}
	if err := s.familyRepo.Create(ctx, family); err != nil {
		return nil, fmt.Errorf("create refresh family: %w", err)
	}

	tokens, err := s.tokenSvc.IssueTokenSet(ctx, user, sess.ActiveTenantID, defaultRotateScopes(), familyID)
	if err != nil {
		return nil, fmt.Errorf("issue tokens: %w", err)
	}
	s.log.Info().
		Str("user_id", userID.String()).
		Str("session_id", sessionID.String()).
		Str("active_tenant", sess.ActiveTenantID.String()).
		Msg("tokens rotated for active tenant switch")
	return tokens, nil
}

// defaultRotateScopes — minimum viable scope set for session-minted tokens.
// Mirrors what /auth/login hands out for a first-party session (see
// membership.DefaultScopes()). Kept local here to avoid a circular import
// and to make the rotate surface's scope contract explicit.
func defaultRotateScopes() []string {
	return []string{"openid", "profile", "email"}
}
