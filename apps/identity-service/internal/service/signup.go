// Package service — signup_service.go
//
// Implements the tenantless consumer-signup flow (Phase 1 of the dual-product
// onboarding plan). A single `Signup` call atomically creates:
//
//	1. A personal tenant (tenant_kind='personal', plan='free', max_users=1).
//	2. The user row (status='pending_verification').
//	3. An owner membership linking the two.
//	4. A refresh-token family scoped to the tenant.
//	5. A one-time email verification token (SHA-256 hash stored; raw emailed).
//
// Session + cookie creation happens after the transaction commits, mirroring
// the pattern used by `AuthHandler.Login` (session lifecycle is orthogonal to
// the signup transaction). The verification email is enqueued post-commit;
// send failures don't roll back the signup — the user can /resend later.
//
// RLS note: this transaction runs without a tenant context set (by definition,
// the tenant doesn't exist yet). Migration 000017 (`rls_coalesce`) makes the
// RLS predicates fall-open when `app.current_tenant_id` is unset, so INSERTs
// into RLS-enabled tables (memberships, sessions) succeed.
package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/email"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

// ErrEmailTaken — the chosen email is already bound to a user row.
// Surfaced as HTTP 409 by the handler.
var ErrEmailTaken = errors.New("email already registered")

// ErrDomainClaimed — Phase 2 hook: email's domain is verified-owned by an
// organization. Signup should redirect to that org's login. Not fired in
// Phase 1 because `tenant_domains` doesn't exist yet.
var ErrDomainClaimed = errors.New("email domain is managed by an organization")

// SignupRequest is the validated payload for POST /auth/public/signup.
// Validation rules: email format, password length 10-128 (matches the
// existing Register DTO), display_name 1-100 chars.
type SignupRequest struct {
	Email       string `json:"email"       validate:"required,email,max=255"`
	Password    string `json:"password"    validate:"required,min=10,max=128"`
	DisplayName string `json:"display_name" validate:"required,min=1,max=100"`
	Locale      string `json:"locale"      validate:"omitempty,max=10"`
	Timezone    string `json:"timezone"    validate:"omitempty,max=50"`
}

// SignupResult is what the handler returns to the caller: the new user,
// the auto-created personal tenant, and the session that was just minted.
// The raw session token lives only on `Session.RawToken` (transient) — the
// handler reads it once to set the sso_session cookie, then it's GC'd.
type SignupResult struct {
	User    *model.User
	Tenant  SignupTenant
	Session *model.Session
}

// SignupTenant is a trim view of the created tenant — no need to expose the
// full schema. Mirrors the existing LoginResponse pattern.
type SignupTenant struct {
	ID         uuid.UUID `json:"id"`
	Slug       string    `json:"slug"`
	Name       string    `json:"name"`
	TenantKind string    `json:"tenant_kind"`
}

// SignupServiceDeps is constructor-bundling to keep the call-site short in
// main.go without introducing an extra module. Holds the minimum set of
// collaborators the flow needs.
type SignupServiceDeps struct {
	Pool             *pgxpool.Pool
	UserRepo         *repository.UserRepository
	SessionSvc       *SessionService
	VerificationRepo *repository.EmailVerificationRepository
	PasswordSvc      *PasswordService
	Publisher        event.Publisher
	EmailProvider    email.Provider
	// AuthzOutboxRepo is optional — when nil, tuple writes are skipped (dev
	// convenience). When present, each membership INSERT enqueues a matching
	// `user:<uid> owner organization:<tid>` tuple so authz-service's worker
	// can populate OpenFGA. Strongly recommended for any environment that
	// runs the ReBAC gate on admin routes.
	AuthzOutboxRepo  *repository.AuthzOutboxRepository
	Log              zerolog.Logger
	// VerifyLinkBaseURL is the login-portal origin — e.g. "http://localhost:4300".
	// Verification emails link to f"{VerifyLinkBaseURL}/verify-email?token=<raw>".
	VerifyLinkBaseURL string
	// RefreshTTL is the refresh-token family lifetime; passed through to the
	// family insert so sessions created here expire consistently with /auth/login.
	RefreshTTL time.Duration
	// TokenTTL is the verification link lifetime. 24h is the plan default.
	TokenTTL time.Duration
	// SenderAddress is the From: for verification emails.
	SenderAddress string
}

// SignupService orchestrates consumer signup. Single-method surface (Signup)
// today; verify-email + resend live alongside to share the same dep bundle.
type SignupService struct {
	deps SignupServiceDeps
	log  zerolog.Logger
}

// NewSignupService wraps the deps. Validates non-nil required fields to fail
// fast on wiring mistakes during boot.
func NewSignupService(deps SignupServiceDeps) *SignupService {
	if deps.Pool == nil || deps.UserRepo == nil || deps.SessionSvc == nil ||
		deps.VerificationRepo == nil || deps.PasswordSvc == nil ||
		deps.EmailProvider == nil {
		panic("SignupService: missing required dependency")
	}
	if deps.TokenTTL == 0 {
		deps.TokenTTL = 24 * time.Hour
	}
	return &SignupService{
		deps: deps,
		log:  deps.Log.With().Str("component", "signup_service").Logger(),
	}
}

// Signup is the entry point. The returned SignupResult's Session carries the
// raw cookie token in Session.RawToken — the handler must read it once and
// set the sso_session cookie, then discard.
//
// Failure modes:
//   - ErrEmailTaken: user already exists (409).
//   - ErrDomainClaimed (Phase 2+): email domain is managed (409 with redirect).
//   - Any wrapped tx error: 500.
func (s *SignupService) Signup(ctx context.Context, req SignupRequest, ip, ua string) (*SignupResult, error) {
	// Early duplicate check — avoids starting a tx just to roll back.
	if _, err := s.deps.UserRepo.GetByEmail(ctx, req.Email); err == nil {
		return nil, ErrEmailTaken
	} else if !errors.Is(err, repository.ErrUserNotFound) {
		return nil, fmt.Errorf("precheck email: %w", err)
	}

	passwordHash, err := s.deps.PasswordSvc.Hash(req.Password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	// All DB mutations in one tx. If anything after this fails, no tenant/user
	// is left half-created.
	tx, err := s.deps.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	now := time.Now().UTC()

	// ── 1. tenant ──────────────────────────────────────────────────────────
	tenantID := uuid.New()
	slug, err := uniquePersonalSlug(ctx, tx, req.DisplayName)
	if err != nil {
		return nil, err
	}
	tenantName := req.DisplayName + "'s Workspace"
	if _, err := tx.Exec(ctx, `
		INSERT INTO tenants (id, name, slug, display_name, plan, tenant_kind,
			max_users, max_apps, is_active, version, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 'free', 'personal', 1, 1, TRUE, 1, $5, $5)
	`, tenantID, tenantName, slug, req.DisplayName, now); err != nil {
		return nil, fmt.Errorf("insert tenant: %w", err)
	}

	// ── 2. tenant_policies (defaults matching the schema column defaults) ──
	// Written explicitly so we don't depend on column-level DEFAULTs surviving
	// future schema changes.
	if _, err := tx.Exec(ctx, `
		INSERT INTO tenant_policies (id, tenant_id, version, created_at, updated_at)
		VALUES (gen_random_uuid(), $1, 1, $2, $2)
	`, tenantID, now); err != nil {
		return nil, fmt.Errorf("insert tenant_policies: %w", err)
	}

	// ── 3. user (status = pending_verification until email link is clicked) ─
	// Note: `avatar_url` is inserted as empty string (not NULL) so the existing
	// `UserRepository.GetByEmail` scan (which targets a non-nullable `string`,
	// pre-existing behavior) doesn't choke on this row later.
	userID := uuid.New()
	if _, err := tx.Exec(ctx, `
		INSERT INTO users (id, email, email_verified, password_hash, display_name, avatar_url,
			locale, timezone, status, version, created_at, updated_at)
		VALUES ($1, $2, FALSE, $3, $4, '', $5, $6, 'pending_verification', 1, $7, $7)
	`, userID, req.Email, passwordHash, req.DisplayName,
		defaultStr(req.Locale, "en"), defaultStr(req.Timezone, "UTC"), now); err != nil {
		if isDuplicateKeyErr(err) {
			// Raced with a concurrent signup. Return the friendly error.
			return nil, ErrEmailTaken
		}
		return nil, fmt.Errorf("insert user: %w", err)
	}

	// ── 4. owner membership + matching FGA tuple ──────────────────────────
	membershipID := uuid.New()
	if _, err := tx.Exec(ctx, `
		INSERT INTO memberships (id, user_id, tenant_id, role, joined_at, created_at, updated_at)
		VALUES ($1, $2, $3, 'owner', $4, $4, $4)
	`, membershipID, userID, tenantID, now); err != nil {
		return nil, fmt.Errorf("insert membership: %w", err)
	}
	if err := enqueueOwnerTuple(ctx, tx, s.deps.AuthzOutboxRepo, tenantID, userID, membershipID); err != nil {
		return nil, err
	}

	// ── 5. refresh-token family ────────────────────────────────────────────
	// Session refresh lives in its own table; we pre-create the family so
	// future refresh flows have something to rotate against. CurrentJTI is a
	// random uuid; generation starts at 0.
	familyID := uuid.New().String()
	if _, err := tx.Exec(ctx, `
		INSERT INTO refresh_token_families
			(family_id, user_id, tenant_id, client_id, current_jti, generation,
			 is_revoked, created_at, last_rotated_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, 0, FALSE, $6, $6, $7)
	`, familyID, userID, tenantID,
		uuid.MustParse("00000000-0000-0000-0000-000000000001"), // first-party client id
		uuid.New().String(), now, now.Add(s.deps.RefreshTTL)); err != nil {
		return nil, fmt.Errorf("insert refresh family: %w", err)
	}

	// ── 6. email-verification token ────────────────────────────────────────
	rawToken, tokenHash, err := repository.GenerateToken()
	if err != nil {
		return nil, fmt.Errorf("generate verification token: %w", err)
	}
	expiresAt := now.Add(s.deps.TokenTTL)
	if err := s.deps.VerificationRepo.CreateTx(ctx, tx, &repository.EmailVerificationToken{
		TokenHash: tokenHash,
		UserID:    userID,
		Email:     req.Email,
		ExpiresAt: expiresAt,
		CreatedAt: now,
	}); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit signup: %w", err)
	}
	committed = true

	// ── 7. session (outside tx — matches Login's pattern) ──────────────────
	sess, err := s.deps.SessionSvc.Create(ctx, userID, tenantID, ip, ua)
	if err != nil {
		// Tenant + user exist; session creation failing is recoverable: the
		// user can sign in again once email is verified. Surface as an error
		// here so the handler can return 500; a retry loop is out of scope.
		return nil, fmt.Errorf("create session: %w", err)
	}

	// ── 8. send verification email (best-effort) ───────────────────────────
	s.sendVerificationEmail(ctx, req.Email, req.DisplayName, rawToken)

	// ── 9. publish event ───────────────────────────────────────────────────
	_ = s.deps.Publisher.Publish(ctx, event.Event{
		Type:      event.TypeUserCreated,
		Timestamp: now,
		TenantID:  tenantID,
		ActorID:   userID,
		Payload: event.UserCreatedPayload{
			UserID:      userID,
			Email:       req.Email,
			DisplayName: req.DisplayName,
		},
	})

	return &SignupResult{
		User: &model.User{
			ID:          userID,
			Email:       req.Email,
			DisplayName: req.DisplayName,
			Status:      "pending_verification",
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		Tenant: SignupTenant{
			ID:         tenantID,
			Slug:       slug,
			Name:       tenantName,
			TenantKind: "personal",
		},
		Session: sess,
	}, nil
}

// ResendVerification re-issues a verification email for an un-verified user.
// Always returns nil error from the caller's perspective (enumeration resistance
// — the handler returns 202 regardless of outcome). Errors are logged.
//
// Idempotency: pending tokens are invalidated before a new one is issued,
// so the user never holds two live links.
func (s *SignupService) ResendVerification(ctx context.Context, emailAddr string) {
	user, err := s.deps.UserRepo.GetByEmail(ctx, emailAddr)
	if err != nil {
		// Not found OR unexpected error — either way, don't signal externally.
		s.log.Debug().Err(err).Str("email", emailAddr).Msg("resend skipped: user lookup")
		return
	}
	if user.Status != "pending_verification" {
		s.log.Debug().Str("email", emailAddr).Str("status", user.Status).
			Msg("resend skipped: user already verified or inactive")
		return
	}

	if err := s.deps.VerificationRepo.InvalidatePendingByUser(ctx, user.ID); err != nil {
		s.log.Error().Err(err).Msg("resend: invalidate existing tokens")
		return
	}

	rawToken, tokenHash, err := repository.GenerateToken()
	if err != nil {
		s.log.Error().Err(err).Msg("resend: generate token")
		return
	}
	now := time.Now().UTC()
	if err := s.deps.VerificationRepo.Create(ctx, &repository.EmailVerificationToken{
		TokenHash: tokenHash,
		UserID:    user.ID,
		Email:     emailAddr,
		ExpiresAt: now.Add(s.deps.TokenTTL),
		CreatedAt: now,
	}); err != nil {
		s.log.Error().Err(err).Msg("resend: insert new token")
		return
	}

	s.sendVerificationEmail(ctx, emailAddr, user.DisplayName, rawToken)
}

// VerifyEmail consumes a verification token and flips the user's status to
// 'active' + email_verified to TRUE. Returns ErrVerificationTokenNotFound for
// any invalid/expired/already-consumed token (no enumeration leakage — the
// handler returns a generic 410).
func (s *SignupService) VerifyEmail(ctx context.Context, rawToken string) error {
	tokenHash, err := repository.HashRawToken(rawToken)
	if err != nil {
		return repository.ErrVerificationTokenNotFound
	}

	tok, err := s.deps.VerificationRepo.ConsumeByHash(ctx, tokenHash)
	if err != nil {
		return err
	}

	// Flip user status. This is a straight UPDATE — no optimistic-locking
	// version bump, because the state transition is idempotent (pending → active).
	const q = `UPDATE users
		SET email_verified = TRUE, status = 'active', updated_at = NOW()
		WHERE id = $1 AND status = 'pending_verification'`
	if _, err := s.deps.Pool.Exec(ctx, q, tok.UserID); err != nil {
		return fmt.Errorf("activate user: %w", err)
	}

	s.log.Info().
		Str("user_id", tok.UserID.String()).
		Str("email", tok.Email).
		Msg("email verified")

	return nil
}

// sendVerificationEmail is the common post-issue hook. Logs but does not
// return email-send errors — the resend endpoint is the recovery path.
func (s *SignupService) sendVerificationEmail(ctx context.Context, to, displayName, rawToken string) {
	link := fmt.Sprintf("%s/verify-email?token=%s", strings.TrimRight(s.deps.VerifyLinkBaseURL, "/"), rawToken)
	text := fmt.Sprintf(
		"Hi %s,\n\nConfirm your email to finish setting up your WaveConnect account:\n\n%s\n\nThis link expires in %s. If you didn't sign up, ignore this email.\n\n— WaveConnect",
		displayName, link, s.deps.TokenTTL.Round(time.Hour).String(),
	)
	msg := email.Message{
		To:             to,
		From:           s.deps.SenderAddress,
		Subject:        "Verify your WaveConnect email",
		Text:           text,
		IdempotencyKey: "verify-email:" + rawToken[:8], // prefix; dedup-equivalent across retries
		Tags: map[string]string{
			"category": "verify_email",
		},
	}
	if _, err := s.deps.EmailProvider.Send(ctx, msg); err != nil {
		s.log.Warn().Err(err).Str("to", to).Msg("failed to send verification email")
	}
}

// ── helpers ─────────────────────────────────────────────────────────────────

var slugify = regexp.MustCompile(`[^a-z0-9]+`)

// uniquePersonalSlug derives a URL-safe slug from the display name and
// appends a 6-char random hex suffix. Retries once on collision (the DB
// unique constraint will reject duplicates; fresh entropy resolves the race).
func uniquePersonalSlug(ctx context.Context, tx pgx.Tx, displayName string) (string, error) {
	base := slugify.ReplaceAllString(strings.ToLower(displayName), "-")
	base = strings.Trim(base, "-")
	if base == "" {
		base = "user"
	}
	if len(base) > 40 {
		base = base[:40]
	}

	for attempt := 0; attempt < 3; attempt++ {
		suffix := make([]byte, 3)
		if _, err := rand.Read(suffix); err != nil {
			return "", fmt.Errorf("random suffix: %w", err)
		}
		candidate := base + "-" + hex.EncodeToString(suffix)

		var exists bool
		if err := tx.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM tenants WHERE slug = $1)`,
			candidate,
		).Scan(&exists); err != nil {
			return "", fmt.Errorf("check slug: %w", err)
		}
		if !exists {
			return candidate, nil
		}
	}
	return "", errors.New("could not allocate unique tenant slug after 3 attempts")
}

// defaultStr returns def when s is empty. Avoids an if-chain inline in Signup.
func defaultStr(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

// isDuplicateKeyErr — pgconn's duplicate-key SQLSTATE is 23505. We check the
// error text rather than type-asserting to avoid adding a pgconn import.
func isDuplicateKeyErr(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "23505") || strings.Contains(msg, "duplicate key")
}
