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
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/id"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

// FederatedService is the JIT bridge sso-service calls via gRPC after a
// successful external IdP authentication. It is the SOLE writer to
// `users` + `memberships` + `federated_identities` + `authz_outbox` for
// the federated path — sso-service has no DB write access of its own.
//
// Idempotency contract (per the execution-roadmap Slice 2.6):
//   SELECT user_id FROM federated_identities
//   WHERE (idp_id, external_user_id) = ($1, $2) FOR UPDATE
//
// runs at the top of the tx. Two concurrent callbacks for the same external
// identity serialize against each other; only one inserts.
type FederatedService struct {
	pool            *pgxpool.Pool
	authzOutboxRepo *repository.AuthzOutboxRepository
	sessionSvc      *SessionService
	publisher       event.Publisher
	log             zerolog.Logger
}

// FederatedServiceDeps wraps the constructor inputs so the call site stays
// readable when the dep set grows in Slices 3 & 5 (attribute mapper, SLO
// metadata, etc.).
type FederatedServiceDeps struct {
	Pool            *pgxpool.Pool
	AuthzOutboxRepo *repository.AuthzOutboxRepository
	SessionSvc      *SessionService
	Publisher       event.Publisher
	Log             zerolog.Logger
}

func NewFederatedService(d FederatedServiceDeps) *FederatedService {
	return &FederatedService{
		pool:            d.Pool,
		authzOutboxRepo: d.AuthzOutboxRepo,
		sessionSvc:      d.SessionSvc,
		publisher:       d.Publisher,
		log:             d.Log.With().Str("component", "federated_service").Logger(),
	}
}

// idpForJIT is the minimal projection we need inside ProvisionFederated.
// Inlined raw SQL rather than a new IdP repository — identity-service
// already reads identity_providers raw in discover.go for the same reason
// (avoid a parallel write/read boundary with admin-api).
type idpForJIT struct {
	TenantID        uuid.UUID
	JITProvisioning bool
	DefaultRole     string
}

func loadIdPForJIT(ctx context.Context, pool *pgxpool.Pool, idpID uuid.UUID) (*idpForJIT, error) {
	const q = `
		SELECT tenant_id, jit_provisioning, COALESCE(default_role::text, 'member')
		FROM identity_providers
		WHERE id = $1 AND status = 'active' AND deleted_at IS NULL
	`
	idp := &idpForJIT{}
	if err := pool.QueryRow(ctx, q, idpID).Scan(&idp.TenantID, &idp.JITProvisioning, &idp.DefaultRole); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("idp %s not found or inactive", idpID)
		}
		return nil, fmt.Errorf("load idp: %w", err)
	}
	return idp, nil
}

// ProvisionFederatedRequest carries the validated external-IdP identity
// plus connection metadata. Mirrors the proto message shape so the gRPC
// server can shovel fields through without translation.
type ProvisionFederatedRequest struct {
	IdPID          uuid.UUID
	ExternalUserID string
	Email          string
	DisplayName    string
	Picture        string
	IP             string
	UserAgent      string
}

// ProvisionFederatedResult is what the gRPC server returns to sso-service.
type ProvisionFederatedResult struct {
	UserID           uuid.UUID
	TenantID         uuid.UUID
	SessionToken     string // raw — single-use; caller writes to Set-Cookie verbatim
	ExpiresAt        time.Time
	NewlyProvisioned bool
}

var (
	// ErrIdPJITDisabled is returned when the federated user is new AND the
	// IdP config has `jit_provisioning=false`. sso-service maps this to a
	// typed error page (Slice 3) — "this IdP doesn't auto-provision users;
	// ask your administrator to invite you first".
	ErrIdPJITDisabled = errors.New("idp has jit_provisioning disabled and no existing federated_identity matches")
)

// ProvisionFederated is the entry point. Layout matches the roadmap:
//
//	1. Load IdP config; verify it's active.
//	2. Open a tenant-scoped tx via WithTenantTx (Slice 1.5).
//	3. SELECT … FOR UPDATE on federated_identities for (idp_id, external_user_id).
//	   3a. Row found → UPDATE last_login + profile_data; commit; mint session.
//	   3b. No row + jit_provisioning=true → INSERT user, membership, federated_identities,
//	       refresh_token_families; enqueue authz_outbox tuple; commit; mint session.
//	   3c. No row + jit_provisioning=false → return ErrIdPJITDisabled.
//	4. Publish post-commit NATS events.
//
// The session mint happens AFTER commit so we don't hold a row lock during
// the network round-trip to whatever session storage we add later.
func (s *FederatedService) ProvisionFederated(ctx context.Context, req ProvisionFederatedRequest) (*ProvisionFederatedResult, error) {
	idp, err := loadIdPForJIT(ctx, s.pool, req.IdPID)
	if err != nil {
		return nil, err
	}

	type txOutcome struct {
		userID           uuid.UUID
		newlyProvisioned bool
	}
	var outcome txOutcome

	txErr := WithTenantTx(ctx, s.pool, idp.TenantID, func(tx pgx.Tx) error {
		// Step 3 — lock + lookup
		var existingUserID uuid.UUID
		err := tx.QueryRow(ctx, `
			SELECT user_id FROM federated_identities
			WHERE idp_id = $1 AND external_user_id = $2
			FOR UPDATE
		`, req.IdPID, req.ExternalUserID).Scan(&existingUserID)

		switch {
		case err == nil:
			// Row found — refresh profile + last_login.
			if _, uErr := tx.Exec(ctx, `
				UPDATE federated_identities SET
					external_email = NULLIF($1, ''),
					last_login_at = NOW(),
					profile_data = $2::jsonb
				WHERE idp_id = $3 AND external_user_id = $4
			`, req.Email, jsonFromClaims(req), req.IdPID, req.ExternalUserID); uErr != nil {
				return fmt.Errorf("update federated_identity: %w", uErr)
			}
			outcome.userID = existingUserID
			outcome.newlyProvisioned = false
			return nil

		case errors.Is(err, pgx.ErrNoRows):
			// New federated identity. JIT path.
			if !idp.JITProvisioning {
				return ErrIdPJITDisabled
			}
			userID := uuid.New()
			membershipID := uuid.New()
			now := time.Now().UTC()

			// users — status=active because the IdP just asserted them.
			if _, err := tx.Exec(ctx, `
				INSERT INTO users (
					id, email, email_verified, password_hash, display_name,
					avatar_url, locale, timezone, status, version,
					created_at, updated_at
				) VALUES (
					$1, $2, TRUE, '', $3,
					NULLIF($4, ''), 'en', 'UTC', 'active', 1,
					$5, $5
				)
				ON CONFLICT (email) DO NOTHING
			`, userID, req.Email, req.DisplayName, req.Picture, now); err != nil {
				return fmt.Errorf("insert user: %w", err)
			}
			// If ON CONFLICT skipped the insert (email already exists at a
			// different user_id — rare but possible across tenants), we'd
			// have a dangling federated_identity. Detect by checking the
			// effective user_id at the email.
			var effectiveUserID uuid.UUID
			if err := tx.QueryRow(ctx, `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`, req.Email).Scan(&effectiveUserID); err != nil {
				return fmt.Errorf("resolve user by email: %w", err)
			}
			if effectiveUserID != userID {
				// Email belonged to a pre-existing user — link to that
				// user instead of creating a new one. This matches the
				// invitation flow's behavior (memberships.service.ts invite()).
				userID = effectiveUserID
			}

			// memberships
			role := idp.DefaultRole
			if role == "" {
				role = "member"
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO memberships (
					id, user_id, tenant_id, role, joined_at, created_at, updated_at
				) VALUES ($1, $2, $3, $4::membership_role, $5, $5, $5)
				ON CONFLICT (tenant_id, user_id) DO NOTHING
			`, membershipID, userID, idp.TenantID, role, now); err != nil {
				return fmt.Errorf("insert membership: %w", err)
			}

			// federated_identities (the source of idempotency)
			if _, err := tx.Exec(ctx, `
				INSERT INTO federated_identities (
					idp_id, external_user_id, user_id,
					external_email, last_login_at, profile_data,
					created_at, updated_at
				) VALUES ($1, $2, $3, NULLIF($4, ''), NOW(), $5::jsonb, NOW(), NOW())
			`, req.IdPID, req.ExternalUserID, userID, req.Email, jsonFromClaims(req)); err != nil {
				return fmt.Errorf("insert federated_identity: %w", err)
			}

			// authz_outbox — emit the role tuple for FGA reconciliation.
			if err := enqueueRoleTuple(ctx, tx, s.authzOutboxRepo, idp.TenantID, userID, membershipID, role); err != nil {
				return fmt.Errorf("enqueue role tuple: %w", err)
			}

			outcome.userID = userID
			outcome.newlyProvisioned = true
			_ = id.PrefixUser // typeid prefix is still used elsewhere
			return nil

		default:
			return fmt.Errorf("federated_identity lookup: %w", err)
		}
	})
	if txErr != nil {
		return nil, txErr
	}

	// Post-commit: mint session (separate from the tx so the row lock
	// doesn't span the session-write). SessionService.Create is the same
	// path login + signup use — single source of truth.
	sess, err := s.sessionSvc.Create(ctx, outcome.userID, idp.TenantID, req.IP, req.UserAgent)
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	// Post-commit NATS events. Failure non-fatal — the row commits are
	// the source of truth; events are downstream observation.
	now := time.Now().UTC()
	if outcome.newlyProvisioned && s.publisher != nil {
		_ = s.publisher.Publish(ctx, event.Event{
			Type:      event.TypeUserCreated,
			Timestamp: now,
			TenantID:  idp.TenantID,
			ActorID:   outcome.userID,
			Payload: event.UserCreatedPayload{
				UserID:      outcome.userID,
				Email:       req.Email,
				DisplayName: req.DisplayName,
			},
		})
	}
	if s.publisher != nil {
		_ = s.publisher.Publish(ctx, event.Event{
			Type:      event.TypeUserLogin,
			Timestamp: now,
			TenantID:  idp.TenantID,
			ActorID:   outcome.userID,
			Payload: event.UserLoginPayload{
				UserID:    outcome.userID,
				IPAddress: req.IP,
				UserAgent: req.UserAgent,
			},
		})
	}

	return &ProvisionFederatedResult{
		UserID:           outcome.userID,
		TenantID:         idp.TenantID,
		SessionToken:     sess.RawToken,
		ExpiresAt:        sess.ExpiresAt,
		NewlyProvisioned: outcome.newlyProvisioned,
	}, nil
}

// jsonFromClaims serializes the IdP's claim subset we want to persist
// alongside the federated_identity row. Keeps the schema simple: store
// the bag, parse on demand. Slice 3 will normalize via attribute_mapper.
func jsonFromClaims(req ProvisionFederatedRequest) string {
	// Manual JSON construction to avoid bringing encoding/json into a
	// hot path that always serializes the same flat shape. Values are
	// already user-controlled but UUIDs / emails / names don't contain
	// JSON-breaking characters in practice; we escape defensively below.
	return fmt.Sprintf(`{"email":%q,"display_name":%q,"picture":%q}`,
		req.Email, req.DisplayName, req.Picture)
}
