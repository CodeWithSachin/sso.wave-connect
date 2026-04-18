// Package service — signup_org.go
//
// Phase 2 org-signup flow. One atomic transaction creates:
//
//	1. An organization tenant (tenant_kind='organization', admin-chosen slug).
//	2. tenant_policies row (defaults).
//	3. The admin user (status='pending_verification' — verified via the domain
//	   instead of the consumer email-verification flow; see VerifyEmail below
//	   which still runs for the admin's individual email ownership).
//	4. Owner membership linking user to tenant.
//	5. Refresh-token family.
//	6. Email-verification token (admin email proof — separate from domain).
//	7. Pending tenant_domains row with a fresh TXT verification token.
//
// Distinct from consumer signup in three ways:
//   - Requires an explicit `domain` field; admin_email's domain must match.
//   - Creates `tenant_kind='organization'` with a user-chosen slug (not
//     auto-generated from the person's name).
//   - Returns DNS-setup instructions along with the session; the UI parks
//     the admin on /signup-org/verify-domain until the TXT record lands.
//
// The signup service itself does NOT initiate the DNS lookup — the verification
// cron worker picks up the pending row and checks periodically. The admin
// can also hit POST /api/v1/tenants/:id/domains/:id/verify to force a check.
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	dnsresolver "github.com/wave-connect/sso-platform/apps/identity-service/internal/dns"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/email"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

// ErrSlugTaken — the admin-chosen tenant slug is already in use.
var ErrSlugTaken = errors.New("tenant slug already taken")

// ErrDomainEmailMismatch — admin email's domain doesn't match the claimed
// domain. Enforced to block someone with `evil@gmail.com` claiming `google.com`.
var ErrDomainEmailMismatch = errors.New("admin email must belong to the claimed domain")

// ErrDomainAlreadyClaimed — another tenant already has a VERIFIED claim on
// this domain. Signup is rejected; the admin should log into the existing
// workspace via /auth/public/discover (Phase 3) instead.
var ErrDomainAlreadyClaimed = errors.New("domain is already owned by another workspace")

// SignupOrgRequest is the validated payload for POST /auth/public/signup-org.
type SignupOrgRequest struct {
	OrgName  string `json:"org_name"  validate:"required,min=1,max=255"`
	OrgSlug  string `json:"org_slug"  validate:"required,min=3,max=100"`
	Domain   string `json:"domain"    validate:"required,min=4,max=255"`
	Email    string `json:"email"     validate:"required,email,max=255"`
	Password string `json:"password"  validate:"required,min=10,max=128"`
	FullName string `json:"full_name" validate:"required,min=1,max=100"`
}

// SignupOrgResult contains the artifacts the UI needs to render the DNS
// instructions page.
type SignupOrgResult struct {
	User       *model.User
	Tenant     SignupOrgTenant
	Session    *model.Session
	DomainRow  SignupOrgDomain
	TXTRecord  TXTInstructions
}

// SignupOrgTenant is the response-shaped view of the created tenant.
type SignupOrgTenant struct {
	ID         uuid.UUID `json:"id"`
	Slug       string    `json:"slug"`
	Name       string    `json:"name"`
	TenantKind string    `json:"tenant_kind"`
}

// SignupOrgDomain is the response-shaped view of the pending domain claim.
type SignupOrgDomain struct {
	ID        uuid.UUID `json:"id"`
	Domain    string    `json:"domain"`
	Status    string    `json:"status"`
	ExpiresAt time.Time `json:"expires_at"`
}

// TXTInstructions tells the UI exactly what to publish in DNS. Deliberately
// explicit so we can render copy-paste-ready text:
//
//	Host:  _wave-connect-verify.acme.com
//	Type:  TXT
//	Value: wave-connect-verify=<nonce>
type TXTInstructions struct {
	Host    string `json:"host"`     // e.g. "_wave-connect-verify.acme.com"
	Type    string `json:"type"`     // always "TXT" in Phase 2
	Value   string `json:"value"`    // "wave-connect-verify=<nonce>"
	Nonce   string `json:"nonce"`    // raw nonce — same substring that's in `value`
}

// SignupOrgServiceDeps mirrors SignupServiceDeps but adds the tenant_domains
// repository. Kept in a separate struct/service because the shapes diverge
// enough that merging would require boolean flags throughout.
type SignupOrgServiceDeps struct {
	Pool             *pgxpool.Pool
	UserRepo         *repository.UserRepository
	SessionSvc       *SessionService
	VerificationRepo *repository.EmailVerificationRepository
	DomainRepo       *repository.TenantDomainRepository
	PasswordSvc      *PasswordService
	Publisher        event.Publisher
	EmailProvider    email.Provider
	// AuthzOutboxRepo — see SignupServiceDeps.AuthzOutboxRepo.
	AuthzOutboxRepo  *repository.AuthzOutboxRepository
	Log              zerolog.Logger
	VerifyLinkBaseURL string
	RefreshTTL       time.Duration
	TokenTTL         time.Duration
	ClaimTTL         time.Duration // how long an unverified claim lives before expiring (default 30d)
	SenderAddress    string
}

// SignupOrgService orchestrates the org-creation path. Public methods:
// `SignupOrg` and (Phase 2.5) the on-demand verify endpoint live in a sibling
// DomainService to keep responsibilities split.
type SignupOrgService struct {
	deps SignupOrgServiceDeps
	log  zerolog.Logger
}

// NewSignupOrgService validates required deps and applies sensible defaults.
func NewSignupOrgService(deps SignupOrgServiceDeps) *SignupOrgService {
	if deps.Pool == nil || deps.UserRepo == nil || deps.SessionSvc == nil ||
		deps.VerificationRepo == nil || deps.DomainRepo == nil ||
		deps.PasswordSvc == nil || deps.EmailProvider == nil {
		panic("SignupOrgService: missing required dependency")
	}
	if deps.TokenTTL == 0 {
		deps.TokenTTL = 24 * time.Hour
	}
	if deps.ClaimTTL == 0 {
		deps.ClaimTTL = 30 * 24 * time.Hour
	}
	return &SignupOrgService{
		deps: deps,
		log:  deps.Log.With().Str("component", "signup_org_service").Logger(),
	}
}

// SignupOrg creates the tenant + admin + pending claim. On success the admin
// has a valid session cookie and DNS-verification instructions in the result.
func (s *SignupOrgService) SignupOrg(ctx context.Context, req SignupOrgRequest, ip, ua string) (*SignupOrgResult, error) {
	// ── 1. input normalization / preconditions ─────────────────────────────
	normalizedDomain, err := dnsresolver.NormalizeDomain(req.Domain)
	if err != nil {
		return nil, fmt.Errorf("domain: %w", err)
	}
	emailDomain, ok := emailDomainFromAddr(req.Email)
	if !ok || emailDomain != normalizedDomain {
		return nil, ErrDomainEmailMismatch
	}
	slug, err := normalizeSlug(req.OrgSlug)
	if err != nil {
		return nil, err
	}

	// Domain already claimed? We check here (outside the tx) so we can return
	// a friendly error without rolling anything back. The verifier also
	// enforces at commit time via the partial unique index.
	if existing, err := s.deps.DomainRepo.FindVerifiedByDomain(ctx, normalizedDomain); err == nil && existing != nil {
		return nil, ErrDomainAlreadyClaimed
	} else if err != nil && !errors.Is(err, repository.ErrTenantDomainNotFound) {
		return nil, fmt.Errorf("precheck verified domain: %w", err)
	}

	// User email already in use? Return 409 shape so the UI can prompt login.
	if _, err := s.deps.UserRepo.GetByEmail(ctx, req.Email); err == nil {
		return nil, ErrEmailTaken
	} else if !errors.Is(err, repository.ErrUserNotFound) {
		return nil, fmt.Errorf("precheck email: %w", err)
	}

	// Slug collision → 409. The partial unique index on tenants.slug catches
	// concurrent races; this pre-check gives a nicer error for the common case.
	if taken, err := isSlugTaken(ctx, s.deps.Pool, slug); err != nil {
		return nil, err
	} else if taken {
		return nil, ErrSlugTaken
	}

	passwordHash, err := s.deps.PasswordSvc.Hash(req.Password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	// ── 2. one transaction for all DB writes ───────────────────────────────
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
	tenantID := uuid.New()

	// 2a. tenant (organization).
	if _, err := tx.Exec(ctx, `
		INSERT INTO tenants (id, name, slug, display_name, domain, plan, tenant_kind,
			max_users, max_apps, is_active, version, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'free', 'organization', 50, 5, TRUE, 1, $6, $6)
	`, tenantID, req.OrgName, slug, req.OrgName, normalizedDomain, now); err != nil {
		if isDuplicateKeyErr(err) {
			return nil, ErrSlugTaken
		}
		return nil, fmt.Errorf("insert org tenant: %w", err)
	}

	// 2b. tenant_policies with defaults.
	if _, err := tx.Exec(ctx, `
		INSERT INTO tenant_policies (id, tenant_id, version, created_at, updated_at)
		VALUES (gen_random_uuid(), $1, 1, $2, $2)
	`, tenantID, now); err != nil {
		return nil, fmt.Errorf("insert tenant_policies: %w", err)
	}

	// 2c. admin user (status pending_verification; see signup.go for reasoning).
	// Note: avatar_url is '' rather than NULL for the same pre-existing-bug
	// reason documented in signup.go.
	userID := uuid.New()
	if _, err := tx.Exec(ctx, `
		INSERT INTO users (id, email, email_verified, password_hash, display_name, avatar_url,
			locale, timezone, status, version, created_at, updated_at)
		VALUES ($1, $2, FALSE, $3, $4, '', 'en', 'UTC', 'pending_verification', 1, $5, $5)
	`, userID, req.Email, passwordHash, req.FullName, now); err != nil {
		if isDuplicateKeyErr(err) {
			return nil, ErrEmailTaken
		}
		return nil, fmt.Errorf("insert admin user: %w", err)
	}

	// 2d. owner membership + matching FGA tuple (so ReBAC admin routes
	// recognize this user as organization:<tid> owner).
	membershipID := uuid.New()
	if _, err := tx.Exec(ctx, `
		INSERT INTO memberships (id, user_id, tenant_id, role, joined_at, created_at, updated_at)
		VALUES ($1, $2, $3, 'owner', $4, $4, $4)
	`, membershipID, userID, tenantID, now); err != nil {
		return nil, fmt.Errorf("insert owner membership: %w", err)
	}
	if err := enqueueOwnerTuple(ctx, tx, s.deps.AuthzOutboxRepo, tenantID, userID, membershipID); err != nil {
		return nil, err
	}

	// 2e. refresh-token family.
	familyID := uuid.New().String()
	if _, err := tx.Exec(ctx, `
		INSERT INTO refresh_token_families
			(family_id, user_id, tenant_id, client_id, current_jti, generation,
			 is_revoked, created_at, last_rotated_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, 0, FALSE, $6, $6, $7)
	`, familyID, userID, tenantID,
		uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		uuid.New().String(), now, now.Add(s.deps.RefreshTTL)); err != nil {
		return nil, fmt.Errorf("insert refresh family: %w", err)
	}

	// 2f. email-verification token for the ADMIN's personal email ownership.
	// This proves the human controls the inbox — separate from DNS proof of
	// the ORG'S domain ownership (which 2g handles).
	rawEmailToken, emailTokenHash, err := repository.GenerateToken()
	if err != nil {
		return nil, fmt.Errorf("generate email token: %w", err)
	}
	if err := s.deps.VerificationRepo.CreateTx(ctx, tx, &repository.EmailVerificationToken{
		TokenHash: emailTokenHash,
		UserID:    userID,
		Email:     req.Email,
		ExpiresAt: now.Add(s.deps.TokenTTL),
		CreatedAt: now,
	}); err != nil {
		return nil, err
	}

	// 2g. pending domain claim.
	rawDomainToken, err := generateDomainNonce()
	if err != nil {
		return nil, fmt.Errorf("generate domain nonce: %w", err)
	}
	domainRow := repository.TenantDomain{
		ID:                 uuid.New(),
		TenantID:           tenantID,
		Domain:             normalizedDomain,
		VerificationMethod: "dns_txt",
		VerificationToken:  rawDomainToken,
		IsPrimary:          false, // flipped to true when MarkVerified fires
		ExpiresAt:          now.Add(s.deps.ClaimTTL),
		CreatedBy:          &userID,
		CreatedAt:          now,
	}
	if err := s.deps.DomainRepo.CreateTx(ctx, tx, &domainRow); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit signup-org: %w", err)
	}
	committed = true

	// ── 3. session + verification email (outside tx) ───────────────────────
	sess, err := s.deps.SessionSvc.Create(ctx, userID, tenantID, ip, ua)
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	s.sendVerificationEmail(ctx, req.Email, req.FullName, rawEmailToken)

	_ = s.deps.Publisher.Publish(ctx, event.Event{
		Type:      event.TypeUserCreated,
		Timestamp: now,
		TenantID:  tenantID,
		ActorID:   userID,
		Payload: event.UserCreatedPayload{
			UserID:      userID,
			Email:       req.Email,
			DisplayName: req.FullName,
		},
	})

	return &SignupOrgResult{
		User: &model.User{
			ID:          userID,
			Email:       req.Email,
			DisplayName: req.FullName,
			Status:      "pending_verification",
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		Tenant: SignupOrgTenant{
			ID:         tenantID,
			Slug:       slug,
			Name:       req.OrgName,
			TenantKind: "organization",
		},
		Session: sess,
		DomainRow: SignupOrgDomain{
			ID:        domainRow.ID,
			Domain:    normalizedDomain,
			Status:    "pending",
			ExpiresAt: domainRow.ExpiresAt,
		},
		TXTRecord: TXTInstructions{
			Host:  dnsresolver.VerifyHost(normalizedDomain),
			Type:  "TXT",
			Value: "wave-connect-verify=" + rawDomainToken,
			Nonce: rawDomainToken,
		},
	}, nil
}

// sendVerificationEmail reuses the same template pattern as SignupService,
// but tags the email for audit.
func (s *SignupOrgService) sendVerificationEmail(ctx context.Context, to, name, rawToken string) {
	link := fmt.Sprintf("%s/verify-email?token=%s", strings.TrimRight(s.deps.VerifyLinkBaseURL, "/"), rawToken)
	text := fmt.Sprintf(
		"Hi %s,\n\nConfirm your email to finish setting up your WaveConnect workspace:\n\n%s\n\nThis link expires in %s.\n\n— WaveConnect",
		name, link, s.deps.TokenTTL.Round(time.Hour).String(),
	)
	msg := email.Message{
		To:             to,
		From:           s.deps.SenderAddress,
		Subject:        "Verify your WaveConnect admin email",
		Text:           text,
		IdempotencyKey: "verify-email-org:" + rawToken[:8],
		Tags:           map[string]string{"category": "verify_email_org"},
	}
	if _, err := s.deps.EmailProvider.Send(ctx, msg); err != nil {
		s.log.Warn().Err(err).Str("to", to).Msg("failed to send admin verification email")
	}
}

// ── helpers ─────────────────────────────────────────────────────────────────

// normalizeSlug lowercases, replaces invalid chars with '-', and collapses
// runs. Returns ErrInvalidDomain-style error for empty slugs.
func normalizeSlug(raw string) (string, error) {
	s := strings.ToLower(strings.TrimSpace(raw))
	s = slugify.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		return "", errors.New("slug must be at least one alphanumeric character")
	}
	if len(s) < 3 {
		return "", errors.New("slug must be at least 3 characters")
	}
	if len(s) > 60 {
		s = s[:60]
	}
	return s, nil
}

// isSlugTaken uses the pool directly (no tx) to check before we begin the
// signup transaction. A race here is handled by the unique-constraint rollback
// in the tx.
func isSlugTaken(ctx context.Context, pool *pgxpool.Pool, slug string) (bool, error) {
	var exists bool
	if err := pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM tenants WHERE slug = $1 AND deleted_at IS NULL)`,
		slug,
	).Scan(&exists); err != nil {
		return false, fmt.Errorf("check slug: %w", err)
	}
	return exists, nil
}

// emailDomainFromAddr extracts the normalized domain portion of an email.
// Returns ("", false) for malformed input.
//
// Uses `dnsresolver.NormalizeHostname` so the same cleanup (lowercase, trim
// trailing dot, reject unicode/whitespace/wildcards) is applied as to the
// claimed domain — otherwise `admin@ACME.COM.` vs `acme.com` would mismatch
// on what's actually the same value. Does NOT enforce eTLD+1 because a
// sender can live on a subdomain (`admin@mail.acme.com`), though the
// caller's mismatch check (admin domain == claim) still rejects that for
// signup-org. Phase 2 review fix #8.
func emailDomainFromAddr(addr string) (string, bool) {
	at := strings.LastIndex(addr, "@")
	if at < 0 || at == len(addr)-1 {
		return "", false
	}
	d, err := dnsresolver.NormalizeHostname(addr[at+1:])
	if err != nil {
		return "", false
	}
	return d, true
}

// generateDomainNonce returns 32 bytes of randomness, base64url-encoded.
// Shape-compatible with repository.GenerateToken but the result is stored
// as the domain verification_token (not hashed — the nonce is what the admin
// publishes in DNS so we need the cleartext).
func generateDomainNonce() (string, error) {
	raw, _, err := repository.GenerateToken()
	return raw, err
}
