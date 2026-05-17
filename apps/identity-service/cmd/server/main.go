// Package main is the identity-service entry point.
//
//	@title						Identity Service API
//	@version					1.0
//	@description				User auth, sessions, MFA, OAuth2 token, tenant domains, migration.
//	@BasePath					/
//	@securityDefinitions.apikey	BearerAuth
//	@in							header
//	@name						Authorization
package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/authz"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
	dnsresolver "github.com/wave-connect/sso-platform/apps/identity-service/internal/dns"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/email"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	identitygrpc "github.com/wave-connect/sso-platform/apps/identity-service/internal/grpc"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/handler"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/id"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/middleware"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/openapi"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/subscriber"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/worker"
	"github.com/wave-connect/sso-platform/libs/go-scalar"
	ssonats "github.com/wave-connect/sso-platform/libs/nats"
	pb "github.com/wave-connect/sso-platform/libs/proto/gen/go/identity/v1"
)

// To regenerate the OpenAPI spec, run: `pnpm nx run identity-service:openapi:export`

func main() {
	log := zerolog.New(os.Stdout).With().Timestamp().Caller().Logger()

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	// --- PostgreSQL ---
	poolCfg, err := pgxpool.ParseConfig(cfg.Database.URL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to parse database URL")
	}
	poolCfg.MaxConns = cfg.Database.MaxConns
	poolCfg.MinConns = cfg.Database.MinConns
	poolCfg.MaxConnLifetime = cfg.Database.MaxConnLifetime

	pool, err := pgxpool.NewWithConfig(context.Background(), poolCfg)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create connection pool")
	}
	defer pool.Close()

	if err := pool.Ping(context.Background()); err != nil {
		log.Warn().Err(err).Msg("database ping failed on startup")
	}

	// --- Redis ---
	redisOpts, err := redis.ParseURL(cfg.Redis.URL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to parse Redis URL")
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()

	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Warn().Err(err).Msg("redis ping failed on startup")
	}

	// --- Repositories ---
	userRepo := repository.NewUserRepository(pool)
	membershipRepo := repository.NewMembershipRepository(pool)
	sessionRepo := repository.NewSessionRepository(pool)
	denyRepo := repository.NewTokenDenyRepository(rdb)
	familyRepo := repository.NewRefreshFamilyRepository(pool)
	policyRepo := repository.NewPolicyRepository(pool)
	emailVerifyRepo := repository.NewEmailVerificationRepository(pool)
	tenantDomainRepo := repository.NewTenantDomainRepository(pool)
	migrationRepo := repository.NewTenantDomainMigrationRepository(pool)
	invitationRepo := repository.NewMembershipInvitationRepository(pool)
	authzOutboxRepo := repository.NewAuthzOutboxRepository()

	// --- NATS ---
	var natsClient interface{}
	natsConn, err := ssonats.Connect(ssonats.Config{URL: cfg.NATS.URL}, log)
	if err != nil {
		log.Warn().Err(err).Msg("NATS connection failed; events will use HTTP/log fallback")
	} else {
		defer natsConn.Close()
		natsClient = natsConn
	}

	// --- Authz client (OpenFGA via authz-service gRPC) ---
	// Used by ReBAC middlewares on admin routes. Nil client is tolerated —
	// middlewares fail closed with 503 so a misconfig is visible, not silent.
	authzClient, err := authz.Dial(cfg.Authz.GRPCURL, authz.DialOptions{
		Insecure: cfg.Authz.Insecure,
	}, log)
	if err != nil {
		log.Warn().Err(err).Msg("authz-service dial failed; ReBAC-gated routes will 502")
	}
	if authzClient == nil {
		log.Warn().Msg("authz client nil — admin migration routes will 503 until AUTHZ_GRPC_URL is set")
	}
	if authzClient != nil {
		defer authzClient.Close()
	}

	// --- Services ---
	passwordSvc := service.NewPasswordService(cfg.Argon2)
	policySvc := service.NewPolicyService(policyRepo, rdb, log)

	publisher := event.NewPublisher(cfg.WebhookServiceURL, natsClient, log)

	// Phase 4: durable event outbox. Domain events that need at-least-once
	// delivery (tenant.domain.verified, user.migration.*) are written to the
	// `event_outbox` table in the same transaction as their state change,
	// then drained by `eventOutboxWorker` to the publisher above.
	outbox := event.NewOutbox(pool)

	tokenSvc, err := service.NewTokenService(cfg.Token, denyRepo, familyRepo, log)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create token service")
	}

	sessionSvc := service.NewSessionService(sessionRepo, publisher, log, cfg.Token.RefreshTTL)

	// Slice 2 — JIT bridge invoked by sso-service after external IdP auth.
	// Wired here so the gRPC ProvisionFederated RPC has a non-nil impl.
	federatedSvc := service.NewFederatedService(service.FederatedServiceDeps{
		Pool:            pool,
		AuthzOutboxRepo: authzOutboxRepo,
		SessionSvc:      sessionSvc,
		Publisher:       publisher,
		Log:             log,
	})

	// --- Email provider (console default in dev; SES stub until Phase 2) ---
	emailKind, err := email.FromEnv(cfg.Email.Provider)
	if err != nil {
		log.Fatal().Err(err).Str("raw", cfg.Email.Provider).Msg("invalid EMAIL_PROVIDER")
	}
	var emailProvider email.Provider
	switch emailKind {
	case email.KindConsole:
		emailProvider = email.NewConsoleProvider(log, cfg.Email.SenderAddress)
	case email.KindSES:
		emailProvider = email.NewSESProvider(log, cfg.Email.SenderAddress)
	}
	log.Info().Str("provider", emailProvider.Name()).Msg("email provider initialized")

	// --- Signup (tenantless public onboarding) ---
	signupSvc := service.NewSignupService(service.SignupServiceDeps{
		Pool:              pool,
		UserRepo:          userRepo,
		SessionSvc:        sessionSvc,
		VerificationRepo:  emailVerifyRepo,
		PasswordSvc:       passwordSvc,
		Publisher:         publisher,
		EmailProvider:     emailProvider,
		AuthzOutboxRepo:   authzOutboxRepo,
		Log:               log,
		VerifyLinkBaseURL: cfg.Email.VerifyLinkBaseURL,
		RefreshTTL:        cfg.Token.RefreshTTL,
		TokenTTL:          cfg.Email.VerifyTokenTTL,
		SenderAddress:     cfg.Email.SenderAddress,
	})

	// --- Org signup + domain claim (Phase 2) ---
	signupOrgSvc := service.NewSignupOrgService(service.SignupOrgServiceDeps{
		Pool:              pool,
		UserRepo:          userRepo,
		SessionSvc:        sessionSvc,
		VerificationRepo:  emailVerifyRepo,
		DomainRepo:        tenantDomainRepo,
		PasswordSvc:       passwordSvc,
		Publisher:         publisher,
		EmailProvider:     emailProvider,
		AuthzOutboxRepo:   authzOutboxRepo,
		Log:               log,
		VerifyLinkBaseURL: cfg.Email.VerifyLinkBaseURL,
		RefreshTTL:        cfg.Token.RefreshTTL,
		TokenTTL:          cfg.Email.VerifyTokenTTL,
		SenderAddress:     cfg.Email.SenderAddress,
	})
	dnsResolver := dnsresolver.NewNetResolver(cfg.DNS.LookupTimeout, cfg.DNS.ResolverAddress)
	log.Info().
		Str("resolver_address", cfg.DNS.ResolverAddress).
		Dur("lookup_timeout", cfg.DNS.LookupTimeout).
		Msg("dns resolver initialized")

	// --- Discover service (Phase 3: email-first login routing) ---
	// Install the typeid formatter so cached tenant IDs are UI-facing.
	service.SetTenantTypeIDFormatter(func(raw string) string {
		parsed, err := uuid.Parse(raw)
		if err != nil {
			return raw
		}
		return id.Format(id.PrefixTenant, parsed)
	})
	discoverSvc := service.NewDiscoverService(pool, rdb, service.DiscoverServiceConfig{
		SsoInitiatorBaseURL: cfg.Discover.SsoInitiatorBaseURL,
		CacheTTL:            cfg.Discover.CacheTTL,
		MinResponseDelay:    cfg.Discover.MinResponseDelay,
		MaxResponseDelay:    cfg.Discover.MaxResponseDelay,
	}, log)
	// Slice 1: mint signed discover_tokens that sso-service's IdPInitiator
	// (Slice 2+) will verify to bind the email-domain → tenant → IdP triple.
	// If construction fails (e.g., symmetric key missing), discover degrades
	// gracefully to token-less URLs — Slice 1's stub IdPInitiator wouldn't
	// have honored the token anyway.
	if discoverTokenSvc, err := service.NewDiscoverTokenService(cfg.Token, rdb, log); err != nil {
		log.Warn().Err(err).Msg("discover_token service init failed; discover URLs will be token-less")
	} else {
		discoverSvc.SetDiscoverTokenService(discoverTokenSvc)
	}
	domainVerifySvc := service.NewDomainVerifyService(pool, tenantDomainRepo, dnsResolver, outbox, log)
	domainVerifyWorker := worker.NewDomainVerifyWorker(domainVerifySvc, 10*time.Minute, 200, log)
	eventOutboxWorker := worker.NewEventOutboxWorker(outbox, publisher, 2*time.Second, 50, log)
	// Phase 4: post-claim user migration. NATS-driven; if NATS isn't wired,
	// the worker no-ops and the rest of the service stays healthy.
	migrationWorker := worker.NewMigrationWorker(
		natsConn, pool, migrationRepo, outbox, emailProvider,
		worker.MigrationWorkerDeps{
			LinkBaseURL:   cfg.Email.VerifyLinkBaseURL,
			SenderAddress: cfg.Email.SenderAddress,
		},
		log,
	)
	migrationSvc := service.NewMigrationService(service.MigrationServiceDeps{
		Pool:            pool,
		MigrationRepo:   migrationRepo,
		SessionRepo:     sessionRepo,
		Outbox:          outbox,
		AuthzOutboxRepo: authzOutboxRepo,
		EmailProvider:   emailProvider,
		SenderAddress:   cfg.Email.SenderAddress,
		Log:             log,
	})

	// --- MFA ---
	mfaRepo := repository.NewMfaRepository(pool)
	mfaService := service.NewMfaService(mfaRepo, tokenSvc, rdb, log)

	// --- WebAuthn ---
	webauthnSvc, err := service.NewWebAuthnService(service.WebAuthnConfig{
		RPID:          cfg.WebAuthn.RPID,
		RPDisplayName: cfg.WebAuthn.RPDisplayName,
		RPOrigin:      cfg.WebAuthn.RPOrigin,
	}, mfaRepo, rdb, log)
	if err != nil {
		log.Warn().Err(err).Msg("WebAuthn service init failed; WebAuthn endpoints will be disabled")
	}

	// --- Handlers ---
	validate := validator.New()
	authHandler := handler.NewAuthHandler(
		userRepo, membershipRepo, familyRepo,
		passwordSvc, tokenSvc, sessionSvc,
		mfaService, mfaRepo,
		publisher, validate, log, cfg.Token.RefreshTTL,
		cfg.Cookie,
	)
	mfaHandler := handler.NewMfaHandler(
		mfaService, mfaRepo,
		userRepo, membershipRepo, familyRepo,
		tokenSvc, sessionSvc, webauthnSvc,
		natsConn,
		validate, log, cfg.Token.RefreshTTL,
		cfg.Cookie,
	)
	tokenHandler := handler.NewTokenHandler(tokenSvc, validate, log)
	sessionHandler := handler.NewSessionHandler(sessionSvc, log)
	healthHandler := handler.NewHealthHandler(pool, rdb)
	wellKnownHandler := handler.NewWellKnownHandler(tokenSvc, cfg.Token)
	signupHandler := handler.NewSignupHandler(signupSvc, validate, log, cfg.Cookie)
	signupOrgHandler := handler.NewSignupOrgHandler(signupOrgSvc, validate, log, cfg.Cookie)
	domainsHandler := handler.NewDomainsHandler(domainVerifySvc, membershipRepo, validate, log)
	discoverHandler := handler.NewDiscoverHandler(discoverSvc, validate, log)
	migrationHandler := handler.NewMigrationHandler(migrationSvc, migrationRepo, pool, log)
	// Phase 6: tenant invitation accept/decline.
	invitationSvc := service.NewInvitationService(service.InvitationServiceDeps{
		Pool:            pool,
		InvitationRepo:  invitationRepo,
		SessionSvc:      sessionSvc,
		PasswordSvc:     passwordSvc,
		AuthzOutboxRepo: authzOutboxRepo,
		Outbox:          outbox,
		Log:             log,
	})
	invitationHandler := handler.NewInvitationHandler(invitationSvc, validate, log, cfg.Cookie)
	// Phase 5: multi-tenant session switcher. Rotate deps (userRepo,
	// familyRepo, tokenSvc, refreshTTL) optional — nil-safe.
	activeTenantSvc := service.NewActiveTenantService(
		membershipRepo, sessionRepo,
		userRepo, familyRepo, tokenSvc, cfg.Token.RefreshTTL,
		log,
	)
	activeTenantHandler := handler.NewActiveTenantHandler(activeTenantSvc, natsConn, validate, log)

	// --- Fiber App ---
	app := fiber.New(fiber.Config{
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		// 16 KB header buffer (default 4 KB) — see comment in
		// apps/sso-service/cmd/server/main.go for the full rationale.
		// Multi-service `localhost` cookie pile-up in dev easily
		// exceeds 4 KB and Fiber returns 431.
		ReadBufferSize: 16 * 1024,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})

	// --- Global Middleware ---
	app.Use(middleware.Recovery(log))
	app.Use(middleware.RequestID())
	app.Use(middleware.CORS())

	// --- Health Routes (no tenant/auth required) ---
	app.Get("/healthz", healthHandler.Liveness)
	app.Get("/readyz", healthHandler.Readiness)

	// --- API Docs (env-gated; CORS open so the docs portal at :4500 can fetch
	// the spec without origin coupling). Set ENABLE_OPENAPI=false in prod.
	if os.Getenv("ENABLE_OPENAPI") != "false" {
		referenceHTML, err := scalar.HTML("/openapi.json", "Identity Service API")
		if err != nil {
			log.Fatal().Err(err).Msg("scalar template execution failed")
		}
		app.Get("/openapi.json", func(c *fiber.Ctx) error {
			c.Set("Content-Type", "application/json; charset=utf-8")
			c.Set("Access-Control-Allow-Origin", "*")
			c.Set("Cache-Control", "public, max-age=60")
			return c.Send(openapi.Spec)
		})
		app.Get("/reference", func(c *fiber.Ctx) error {
			c.Set("Content-Type", "text/html; charset=utf-8")
			c.Set("Access-Control-Allow-Origin", "*")
			return c.SendString(referenceHTML)
		})
	}

	// --- Well-Known Routes ---
	app.Get("/.well-known/openid-configuration", wellKnownHandler.OpenIDConfiguration)
	app.Get("/.well-known/paseto-keys", wellKnownHandler.PASETOKeys)

	// --- Tenantless Public Auth Routes (NO tenant/auth; self-rate-limited) ---
	// Registered BEFORE the /auth group so the TenantExtraction middleware on
	// /auth doesn't also cover these paths. Consumer signup can't carry a
	// tenant header — the tenant is what signup CREATES.
	publicAuth := app.Group("/auth/public")
	publicAuth.Post("/signup", middleware.SignupRateLimit(rdb), signupHandler.Signup)
	publicAuth.Post("/signup-org", middleware.SignupRateLimit(rdb), signupOrgHandler.SignupOrg)
	publicAuth.Post("/verify-email", middleware.VerifyEmailRateLimit(rdb), signupHandler.VerifyEmail)
	publicAuth.Post("/verify-email/resend", middleware.ResendVerificationRateLimit(rdb), signupHandler.ResendVerification)
	// Phase 3: email-first login discovery. Hot path, aggressively rate-limited.
	publicAuth.Get("/discover", middleware.DiscoverRateLimit(rdb), discoverHandler.Discover)
	// Phase 4: post-claim user migration. Token-bound; lookup is idempotent,
	// accept/decline are single-use (idempotency is per migration row, not
	// per HTTP request).
	publicAuth.Get("/migration/:token", migrationHandler.Lookup)
	publicAuth.Post("/migration/:token/accept", migrationHandler.Accept)
	publicAuth.Post("/migration/:token/decline", migrationHandler.Decline)
	// Phase 6: tenant invitation accept/decline. Token-bound; enumeration-
	// resistant. Rate-limiting piggybacks on signup limits — accept can
	// create a user account (first-time invite) so the signup-rate bucket
	// is the right one to throttle brute-force on the token URL.
	publicAuth.Get("/invitation/:token", invitationHandler.Lookup)
	publicAuth.Post("/invitation/:token/accept", middleware.SignupRateLimit(rdb), invitationHandler.Accept)
	publicAuth.Post("/invitation/:token/decline", invitationHandler.Decline)

	// Cookie-auth middleware for all browser-facing endpoints (Phase 2
	// domain mgmt, Phase 4 migrations admin, Phase 5 session switcher).
	// Declared here and re-used below to avoid shadowing surprises from
	// multiple short-var decls.
	sessionAuth := middleware.SessionCookieAuth(sessionRepo)

	// E2E review A1 — write-shaped routes require a verified email. Signup
	// mints a session immediately (so the user lands on a dashboard), but
	// anything that mutates state stays closed until `/auth/public/verify-email`
	// has been consumed. `email_verified` is read from the users table on
	// every gated request — no caching, because the verification window is
	// the one place we want fresh state.
	verifiedEmail := middleware.RequireVerifiedEmail(pool, log)

	// Phase 5: multi-tenant session switcher. Registered BEFORE the `/auth`
	// group so TenantExtraction on `/auth/*` does not also cover these —
	// switching tenants is the operation that changes the session's live
	// tenant, so a tenant header requirement would be chicken-and-egg.
	app.Get("/auth/session/memberships", sessionAuth, activeTenantHandler.ListMemberships)
	app.Patch("/auth/session/active-tenant", sessionAuth, verifiedEmail, activeTenantHandler.SwitchActive)
	app.Post("/auth/session/rotate", sessionAuth, verifiedEmail, activeTenantHandler.Rotate)

	// --- Public Auth Routes (tenant required, policy enforced, rate-limited) ---
	auth := app.Group("/auth", middleware.TenantExtraction(pool), middleware.TenantPolicyEnforcement(policySvc, log))
	auth.Post("/register", middleware.RegisterRateLimit(rdb), authHandler.Register)
	auth.Post("/login", middleware.LoginRateLimit(rdb), authHandler.Login)
	auth.Post("/mfa/verify", mfaHandler.Verify)

	// Logout is registered at /logout (outside the /auth prefix) to bypass TenantExtraction:
	// the tenant is derived from the session cookie's sessions row, so clients shouldn't
	// need to pass X-Tenant-ID. Idempotent — returns 204 even if there's nothing to revoke.
	app.Post("/logout", authHandler.Logout)

	// --- OAuth2 Token Routes (tenant required) ---
	oauth2 := app.Group("/oauth2", middleware.TenantExtraction(pool))
	oauth2.Post("/token", tokenHandler.Refresh)
	oauth2.Post("/revoke", tokenHandler.Revoke)

	// --- Protected Routes (tenant + auth required) ---
	// Fiber note: `app.Group("", mw)` is internally `app.Use(mw)` and applies
	// middleware globally to every subsequent route. To scope
	// TenantExtraction + PASETOAuth to just the intended paths, use two
	// specific-prefix groups instead of a single empty-prefix group. This
	// leaves /tenants/:tenantId/domains/* free to use its own auth.
	pasetoChain := []fiber.Handler{middleware.TenantExtraction(pool), middleware.PASETOAuth(tokenSvc)}

	// /sessions is a per-USER resource (a single user's signed-in devices) —
	// it is intentionally tenant-agnostic. The admin-console authenticates
	// with the sso_session cookie (no bearer token), so SessionCookieAuth is
	// the right middleware here. The earlier A5 fix dropped TenantExtraction
	// from the chain but kept PASETOAuth, which still 401'd cookie clients
	// with "missing authorization header". Switch to sessionAuth so the
	// "My sessions" page works for the only client that hits this endpoint.
	sessionChain := []fiber.Handler{sessionAuth}
	sessions := app.Group("/sessions", sessionChain...)
	sessions.Get("/", sessionHandler.List)
	// Revoking other sessions is a write — gate behind verified email.
	sessions.Delete("/:id", verifiedEmail, sessionHandler.Revoke)
	// Alias for clients using the no-trailing-slash form. Fiber's default
	// StrictRouting=false would already match both, but registering
	// explicitly insulates us from that default ever flipping. Fix #6.
	app.Get("/sessions", append(sessionChain, sessionHandler.List)...)

	// Policy enforcement is appended to the chain so DeleteEnrollment can read
	// `tenant_policy` from Locals and refuse the last-active deletion when the
	// org requires MFA. The other MFA endpoints don't currently consult the
	// policy, but they should still respect IP allowlist + require_sso gates.
	mfaChain := append(pasetoChain, middleware.TenantPolicyEnforcement(policySvc, log))
	mfaProtected := app.Group("/auth/mfa", mfaChain...)
	// MFA enrolment + secret rotation are writes — require verified email.
	// `GET /enrollments` is a read and stays open so the UI can still tell
	// the user their (empty) MFA state pre-verification.
	mfaProtected.Post("/enroll", verifiedEmail, mfaHandler.Enroll)
	mfaProtected.Post("/enroll/:id/verify", verifiedEmail, mfaHandler.VerifyEnrollment)
	mfaProtected.Get("/enrollments", mfaHandler.ListEnrollments)
	mfaProtected.Delete("/enrollments/:id", verifiedEmail, mfaHandler.DeleteEnrollment)
	mfaProtected.Post("/backup-codes/regenerate", verifiedEmail, mfaHandler.RegenerateBackupCodes)
	mfaProtected.Post("/webauthn/register/begin", verifiedEmail, mfaHandler.BeginWebAuthnRegistration)
	mfaProtected.Post("/webauthn/register/complete", verifiedEmail, mfaHandler.CompleteWebAuthnRegistration)
	mfaProtected.Post("/webauthn/login/begin", mfaHandler.BeginWebAuthnLogin)
	mfaProtected.Post("/webauthn/login/complete", mfaHandler.CompleteWebAuthnLogin)

	// --- Tenant domain management (Phase 2) ---
	// Browser-facing (sso_session cookie only). Registered directly on `app`
	// with inline middleware — must NOT share the PASETO chain above.
	// Verify endpoint additionally rate-limited per tenant (fix #3).
	verifyLimit := middleware.DomainVerifyRateLimit(rdb)
	app.Get("/tenants/:tenantId/domains", sessionAuth, domainsHandler.List)
	// Domain CRUD is org-scoped state — must be a verified user.
	app.Post("/tenants/:tenantId/domains", sessionAuth, verifiedEmail, domainsHandler.Add)
	app.Post("/tenants/:tenantId/domains/:id/verify", sessionAuth, verifiedEmail, verifyLimit, domainsHandler.Verify)
	app.Delete("/tenants/:tenantId/domains/:id", sessionAuth, verifiedEmail, domainsHandler.Delete)

	// Phase 4: admin-facing migration controls. Guarded by ReBAC (OpenFGA via
	// authz-service) — caller must hold `admin` on organization:<tenantId>,
	// which per openfga/model.fga covers both `owner` and explicit `admin`.
	// The admin check deliberately runs AFTER SessionCookieAuth so we can pull
	// user_id from locals and pass it to authz.CheckOrgRelation.
	adminOrgGate := middleware.RequireOrgRelation(authzClient, authz.RelAdmin)
	app.Get("/tenants/:tenantId/migrations", sessionAuth, adminOrgGate, migrationHandler.List)
	// Forcing a migration is the highest-impact write — verified email required.
	app.Post("/tenants/:tenantId/migrations/:id/notify-force", sessionAuth, adminOrgGate, verifiedEmail, migrationHandler.NotifyForce)
	app.Post("/tenants/:tenantId/migrations/:id/force", sessionAuth, adminOrgGate, verifiedEmail, migrationHandler.Force)

	// --- Dev-only endpoints (A1.5) ---
	// Gated by BOTH NODE_ENV != production AND IDENTITY_DEV_ENDPOINTS=true.
	// Exists because dev environments have no outbound SMTP — without a
	// way to verify an email, E2E signup is unreachable. Production binaries
	// must not satisfy the gate.
	if handler.DevEnabled() {
		devHandler := handler.NewDevHandler(pool, log)
		log.Warn().Msg("MOUNTING /auth/dev/* — verification-bypass endpoints active (NOT FOR PRODUCTION)")
		app.Get("/auth/dev/verification-link", devHandler.VerificationLink)
		app.Post("/auth/dev/verify-email", devHandler.VerifyEmailNow)
	}

	// --- Start gRPC Server ---
	grpcServer := grpc.NewServer()
	pb.RegisterIdentityServiceServer(grpcServer, identitygrpc.NewIdentityServer(tokenSvc, userRepo, federatedSvc, log))
	reflection.Register(grpcServer)

	go func() {
		grpcAddr := ":50052"
		lis, err := net.Listen("tcp", grpcAddr)
		if err != nil {
			log.Fatal().Err(err).Msg("gRPC listen failed")
		}
		log.Info().Str("addr", grpcAddr).Msg("starting identity-service gRPC")
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatal().Err(err).Msg("gRPC server failed")
		}
	}()

	// --- Start HTTP Server ---
	go func() {
		addr := fmt.Sprintf(":%d", cfg.Server.Port)
		log.Info().Str("addr", addr).Msg("starting identity-service HTTP")
		if err := app.Listen(addr); err != nil {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	// --- Start Background Workers ---
	// Domain-verification cron (Phase 2) + generic event-outbox dispatcher
	// (Phase 4). Lifecycles tied to workerCtx so they exit cleanly on SIGTERM.
	workerCtx, workerCancel := context.WithCancel(context.Background())
	go domainVerifyWorker.Start(workerCtx)
	go eventOutboxWorker.Start(workerCtx)
	// Expiry sweeper (Phase 4/6 followup): hourly cleanup of stale
	// tenant_domain_migrations + pending invitations.
	go worker.NewExpirySweeperWorker(pool, time.Hour, log).Start(workerCtx)

	// Phase 3 followup: discover cache invalidation via NATS. Non-fatal if
	// NATS isn't wired — falls back to the 5-min Redis TTL.
	if natsConn != nil {
		if err := subscriber.RegisterDiscoverInvalidation(natsConn, discoverSvc, log); err != nil {
			log.Warn().Err(err).Msg("discover cache invalidation subscriber failed to start")
		}
	}
	go func() {
		if err := migrationWorker.Start(workerCtx); err != nil {
			log.Warn().Err(err).Msg("migration worker exited with error")
		}
	}()

	// --- Graceful Shutdown ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down identity-service")
	workerCancel()
	grpcServer.GracefulStop()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(ctx); err != nil {
		log.Error().Err(err).Msg("shutdown error")
	}
	log.Info().Msg("shutdown complete")
}
