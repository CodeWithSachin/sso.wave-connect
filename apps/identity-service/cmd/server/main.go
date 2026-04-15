package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/event"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/handler"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/middleware"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/identity-service/internal/service"
)

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

	// --- Services ---
	passwordSvc := service.NewPasswordService(cfg.Argon2)
	policySvc := service.NewPolicyService(policyRepo, rdb, log)

	publisher := event.NewPublisher(cfg.WebhookServiceURL, log)

	tokenSvc, err := service.NewTokenService(cfg.Token, denyRepo, familyRepo, log)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create token service")
	}

	sessionSvc := service.NewSessionService(sessionRepo, publisher, log, cfg.Token.RefreshTTL)

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
	)
	mfaHandler := handler.NewMfaHandler(
		mfaService, mfaRepo,
		userRepo, membershipRepo, familyRepo,
		tokenSvc, sessionSvc, webauthnSvc,
		validate, log, cfg.Token.RefreshTTL,
	)
	tokenHandler := handler.NewTokenHandler(tokenSvc, validate, log)
	sessionHandler := handler.NewSessionHandler(sessionSvc, log)
	healthHandler := handler.NewHealthHandler(pool, rdb)
	wellKnownHandler := handler.NewWellKnownHandler(tokenSvc, cfg.Token)

	// --- Fiber App ---
	app := fiber.New(fiber.Config{
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
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

	// --- Well-Known Routes ---
	app.Get("/.well-known/openid-configuration", wellKnownHandler.OpenIDConfiguration)
	app.Get("/.well-known/paseto-keys", wellKnownHandler.PASETOKeys)

	// --- Public Auth Routes (tenant required, policy enforced, rate-limited) ---
	auth := app.Group("/auth", middleware.TenantExtraction(pool), middleware.TenantPolicyEnforcement(policySvc, log))
	auth.Post("/register", middleware.RegisterRateLimit(rdb), authHandler.Register)
	auth.Post("/login", middleware.LoginRateLimit(rdb), authHandler.Login)
	auth.Post("/mfa/verify", mfaHandler.Verify)

	// --- OAuth2 Token Routes (tenant required) ---
	oauth2 := app.Group("/oauth2", middleware.TenantExtraction(pool))
	oauth2.Post("/token", tokenHandler.Refresh)
	oauth2.Post("/revoke", tokenHandler.Revoke)

	// --- Protected Routes (tenant + auth required) ---
	protected := app.Group("", middleware.TenantExtraction(pool), middleware.PASETOAuth(tokenSvc))
	protected.Get("/sessions", sessionHandler.List)
	protected.Delete("/sessions/:id", sessionHandler.Revoke)
	protected.Post("/auth/mfa/enroll", mfaHandler.Enroll)
	protected.Post("/auth/mfa/enroll/:id/verify", mfaHandler.VerifyEnrollment)
	protected.Get("/auth/mfa/enrollments", mfaHandler.ListEnrollments)
	protected.Delete("/auth/mfa/enrollments/:id", mfaHandler.DeleteEnrollment)
	protected.Post("/auth/mfa/backup-codes/regenerate", mfaHandler.RegenerateBackupCodes)
	protected.Post("/auth/mfa/webauthn/register/begin", mfaHandler.BeginWebAuthnRegistration)
	protected.Post("/auth/mfa/webauthn/register/complete", mfaHandler.CompleteWebAuthnRegistration)
	protected.Post("/auth/mfa/webauthn/login/begin", mfaHandler.BeginWebAuthnLogin)
	protected.Post("/auth/mfa/webauthn/login/complete", mfaHandler.CompleteWebAuthnLogin)

	// --- Graceful Shutdown ---
	go func() {
		addr := fmt.Sprintf(":%d", cfg.Server.Port)
		log.Info().Str("addr", addr).Msg("starting identity-service")
		if err := app.Listen(addr); err != nil {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(ctx); err != nil {
		log.Error().Err(err).Msg("shutdown error")
	}
	log.Info().Msg("shutdown complete")
}
