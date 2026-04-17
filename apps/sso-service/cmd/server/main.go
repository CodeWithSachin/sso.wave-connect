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

	"github.com/wave-connect/sso-platform/apps/sso-service/internal/config"
	"github.com/wave-connect/sso-platform/apps/sso-service/internal/handler"
	"github.com/wave-connect/sso-platform/apps/sso-service/internal/middleware"
	"github.com/wave-connect/sso-platform/apps/sso-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/sso-service/internal/service"
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
	clientRepo := repository.NewOAuthClientRepository(pool)
	consentRepo := repository.NewConsentRepository(pool)
	sessionRepo := repository.NewSessionRepository(pool)

	// --- Services ---
	oauth2Svc, err := service.NewOAuth2Service(cfg.Token, clientRepo, log)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create oauth2 service")
	}

	oidcSvc, err := service.NewOIDCService(cfg.Token, log)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create oidc service")
	}

	// --- Auth Code Tracker (single-use enforcement via Redis) ---
	codeTracker := repository.NewAuthCodeTracker(rdb)

	// --- Handlers ---
	validate := validator.New()
	loginURL := cfg.LoginPortalURL
	oauth2Handler := handler.NewOAuth2Handler(oauth2Svc, oidcSvc, clientRepo, consentRepo, codeTracker, validate, log, loginURL)
	consentHandler := handler.NewConsentHandler(oauth2Svc, clientRepo, consentRepo, validate, log)
	oidcHandler := handler.NewOIDCHandler(oidcSvc, cfg.Token.Issuer, log)
	healthHandler := handler.NewHealthHandler(pool, rdb)

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
	app.Use(middleware.CORS())

	// --- Health Routes (no auth required) ---
	app.Get("/healthz", healthHandler.Liveness)
	app.Get("/readyz", healthHandler.Readiness)

	// --- OIDC Discovery (no auth required) ---
	app.Get("/.well-known/openid-configuration", oidcHandler.Discovery)

	// --- OAuth2 Authorization (checks Bearer token OR sso_session cookie) ---
	app.Get("/oauth2/authorize", middleware.SessionOrTokenAuth(cfg.Token.SymmetricKeyHex, sessionRepo, log), oauth2Handler.Authorize)

	// --- OAuth2 Token (no session auth — uses client credentials) ---
	app.Post("/oauth2/token", oauth2Handler.Token)

	// --- Consent (requires authenticated session) ---
	consent := app.Group("/oauth2/consent", middleware.PASETOAuth(cfg.Token.SymmetricKeyHex, log))
	consent.Get("/", consentHandler.GetConsent)
	consent.Post("/", consentHandler.PostConsent)

	// --- UserInfo (requires Bearer token) ---
	app.Get("/userinfo", oidcHandler.UserInfo)

	// --- Graceful Shutdown ---
	go func() {
		addr := fmt.Sprintf(":%d", cfg.Server.Port)
		log.Info().Str("addr", addr).Msg("starting sso-service")
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
