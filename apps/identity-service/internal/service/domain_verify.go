// Package service — domain_verify.go
//
// Checks pending `tenant_domains` rows against live DNS and flips them to
// 'verified' when the expected TXT record is present. Exposes:
//
//	VerifyOne(ctx, tenantID, domainID) — user-driven, "verify now" button.
//	CheckPending(ctx, limit)           — batch, driven by the cron worker.
//	ListForTenant(ctx, tenantID)       — tenant-admin UI listing.
//	AddDomain(ctx, tenantID, domain)   — post-signup "add another domain" flow.
//
// The service does NOT run the cron itself; see worker/domain_verify_worker.go
// for the scheduler. Keeps the service pure-function-ish and testable without
// a ticker.
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

	dnsresolver "github.com/wave-connect/sso-platform/apps/identity-service/internal/dns"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
)

// VerifyOutcome is the result of a single verification attempt — returned so
// callers (UI + cron) can log + branch.
type VerifyOutcome string

const (
	VerifyOutcomePending     VerifyOutcome = "pending"      // checked, TXT not present yet
	VerifyOutcomeVerified    VerifyOutcome = "verified"     // flipped to verified
	VerifyOutcomeExpired     VerifyOutcome = "expired"      // passed expires_at; flipped to expired
	VerifyOutcomeConflict    VerifyOutcome = "conflict"     // another tenant already owns this domain
	VerifyOutcomeAlreadyDone VerifyOutcome = "already_done" // row was no longer pending
)

// DomainVerifyService is the behaviour shared between the on-demand endpoint
// and the cron worker.
//
// Phase 4 refactor: `publisher` is replaced by `outbox`. The
// `tenant.domain.verified` event is now written to `event_outbox` in the same
// transaction as the status flip, and a separate dispatcher goroutine (see
// worker/event_outbox_worker.go) drains the table to NATS. This bounds event
// loss to a DB crash between flip-commit and dispatch (recoverable by the
// next dispatcher tick) rather than an in-flight NATS hiccup (previously a
// permanent drop).
type DomainVerifyService struct {
	pool     *pgxpool.Pool
	repo     *repository.TenantDomainRepository
	resolver dnsresolver.Resolver
	outbox   *event.Outbox
	log      zerolog.Logger
}

// NewDomainVerifyService wires the deps.
func NewDomainVerifyService(
	pool *pgxpool.Pool,
	repo *repository.TenantDomainRepository,
	resolver dnsresolver.Resolver,
	outbox *event.Outbox,
	log zerolog.Logger,
) *DomainVerifyService {
	return &DomainVerifyService{
		pool:     pool,
		repo:     repo,
		resolver: resolver,
		outbox:   outbox,
		log:      log.With().Str("component", "domain_verify_service").Logger(),
	}
}

// VerifyOne runs a single verification pass against the given claim. The
// tenantID guard ensures one tenant can't force-verify another's domain.
func (s *DomainVerifyService) VerifyOne(ctx context.Context, tenantID, domainID uuid.UUID) (VerifyOutcome, error) {
	row, err := s.repo.GetByID(ctx, tenantID, domainID)
	if err != nil {
		return "", err
	}
	return s.check(ctx, row)
}

// CheckPending picks up to `limit` pending claims and checks each. Returns
// after all attempts complete. Called every ~10 min by the cron; synchronous
// within the worker but the worker bounds concurrency externally.
//
// Emits per-tick INFO summary (Phase 2 review fix #13) so operators can tell
// at a glance whether the cron is alive and what it found. Per-row detail
// stays at DEBUG to avoid log spam when many domains are pending.
func (s *DomainVerifyService) CheckPending(ctx context.Context, limit int) error {
	rows, err := s.repo.ListPendingForCheck(ctx, limit)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		s.log.Info().Int("pending", 0).Msg("domain verify tick: nothing to do")
		return nil
	}
	var verified, stillPending, expired, conflict, errored int
	for i := range rows {
		row := rows[i]
		rowCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
		outcome, cerr := s.check(rowCtx, &row)
		cancel()
		switch outcome {
		case VerifyOutcomeVerified:
			verified++
		case VerifyOutcomePending:
			stillPending++
		case VerifyOutcomeExpired:
			expired++
		case VerifyOutcomeConflict:
			conflict++
		}
		if cerr != nil {
			errored++
		}
		s.log.Debug().
			Str("domain", row.Domain).
			Str("tenant_id", row.TenantID.String()).
			Str("outcome", string(outcome)).
			AnErr("error", cerr).
			Msg("domain verify cron tick (per-row)")
	}
	s.log.Info().
		Int("scanned", len(rows)).
		Int("verified", verified).
		Int("still_pending", stillPending).
		Int("expired", expired).
		Int("conflict", conflict).
		Int("errored", errored).
		Msg("domain verify tick")
	return nil
}

// ListForTenant returns all non-deleted domain rows for a tenant.
func (s *DomainVerifyService) ListForTenant(ctx context.Context, tenantID uuid.UUID) ([]repository.TenantDomain, error) {
	return s.repo.ListByTenant(ctx, tenantID)
}

// SoftDelete releases a claim. Frees the domain for another tenant to claim
// (the partial unique index on verified-per-domain excludes deleted rows).
// Phase 2 review fix #7.
func (s *DomainVerifyService) SoftDelete(ctx context.Context, tenantID, domainID uuid.UUID) error {
	if err := s.repo.SoftDelete(ctx, tenantID, domainID); err != nil {
		return err
	}
	s.log.Info().
		Str("tenant_id", tenantID.String()).
		Str("domain_id", domainID.String()).
		Msg("domain claim soft-deleted")
	return nil
}

// AddDomain initiates a new pending claim for an existing tenant. Called from
// POST /api/v1/tenants/:id/domains. Rejects if a verified claim already
// exists for this domain globally; the admin-email-match rule is NOT enforced
// here because the caller is authenticated with a session tied to the tenant.
//
// Returns the created row (with cleartext `VerificationToken` for TXT setup).
// Callers should surface the token to the user once and never echo it back
// in subsequent list responses.
func (s *DomainVerifyService) AddDomain(ctx context.Context, tenantID, createdBy uuid.UUID, rawDomain string, claimTTL time.Duration) (*repository.TenantDomain, error) {
	normalized, err := dnsresolver.NormalizeDomain(rawDomain)
	if err != nil {
		return nil, err
	}

	if _, err := s.repo.FindVerifiedByDomain(ctx, normalized); err == nil {
		return nil, ErrDomainAlreadyClaimed
	} else if !errors.Is(err, repository.ErrTenantDomainNotFound) {
		return nil, fmt.Errorf("check existing verified: %w", err)
	}

	nonce, err := generateDomainNonce()
	if err != nil {
		return nil, fmt.Errorf("generate nonce: %w", err)
	}
	now := time.Now().UTC()
	if claimTTL == 0 {
		claimTTL = 30 * 24 * time.Hour
	}
	row := &repository.TenantDomain{
		ID:                 uuid.New(),
		TenantID:           tenantID,
		Domain:             normalized,
		VerificationMethod: "dns_txt",
		VerificationToken:  nonce,
		IsPrimary:          false,
		ExpiresAt:          now.Add(claimTTL),
		CreatedBy:          &createdBy,
		CreatedAt:          now,
	}
	if err := s.repo.Create(ctx, row); err != nil {
		return nil, err
	}
	return row, nil
}

// ── internal ────────────────────────────────────────────────────────────────

// check is the core verification step. Always records a check attempt (so
// `last_checked_at` advances) before interpreting the result.
func (s *DomainVerifyService) check(ctx context.Context, row *repository.TenantDomain) (VerifyOutcome, error) {
	if row.Status != "pending" {
		return VerifyOutcomeAlreadyDone, nil
	}
	if time.Now().After(row.ExpiresAt) {
		if err := s.repo.MarkExpired(ctx, row.ID); err != nil {
			return "", fmt.Errorf("mark expired: %w", err)
		}
		return VerifyOutcomeExpired, nil
	}

	if err := s.repo.RecordCheckAttempt(ctx, row.ID); err != nil {
		s.log.Warn().Err(err).Str("domain", row.Domain).Msg("record check attempt")
	}

	host := dnsresolver.VerifyHost(row.Domain)
	records, err := s.resolver.LookupTXT(ctx, host)
	if err != nil {
		s.log.Debug().Err(err).Str("host", host).Msg("txt lookup")
		return VerifyOutcomePending, nil
	}
	if !dnsresolver.ContainsToken(records, row.VerificationToken) {
		return VerifyOutcomePending, nil
	}

	// Phase 4: status flip + event enqueue happen in one transaction. A
	// DB crash between commit and the dispatcher-worker tick still leaves the
	// event in `event_outbox` where it'll be picked up on next boot —
	// strictly stronger than the pre-Phase-4 direct publish which could drop
	// on any NATS hiccup.
	now := time.Now().UTC()
	evt := event.Event{
		Type:      event.TypeTenantDomainVerified,
		Timestamp: now,
		TenantID:  row.TenantID,
		Payload: event.TenantDomainVerifiedPayload{
			TenantID:   row.TenantID,
			DomainID:   row.ID,
			Domain:     row.Domain,
			VerifiedAt: now,
		},
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", fmt.Errorf("begin verify tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	if err := s.repo.MarkVerifiedTx(ctx, tx, row.ID); err != nil {
		if errors.Is(err, repository.ErrDomainAlreadyVerified) {
			s.log.Warn().
				Str("domain", row.Domain).
				Str("losing_tenant", row.TenantID.String()).
				Msg("domain verification lost race — another tenant already verified")
			return VerifyOutcomeConflict, nil
		}
		if errors.Is(err, repository.ErrTenantDomainNotFound) {
			return VerifyOutcomeAlreadyDone, nil
		}
		return "", fmt.Errorf("mark verified: %w", err)
	}

	if err := s.outbox.EnqueueTx(ctx, tx, evt); err != nil {
		return "", fmt.Errorf("enqueue verified event: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit verify tx: %w", err)
	}
	committed = true

	// Promote to primary after the tx commits — losing this race is benign
	// (the row stays verified with is_primary=FALSE) and we don't want to
	// roll back the event emission if promotion fails.
	if err := s.repo.PromotePrimary(ctx, row.ID); err != nil {
		s.log.Warn().Err(err).Str("domain", row.Domain).Msg("promote primary failed (benign)")
	}

	s.log.Info().
		Str("domain", row.Domain).
		Str("tenant_id", row.TenantID.String()).
		Msg("domain verified")

	return VerifyOutcomeVerified, nil
}
