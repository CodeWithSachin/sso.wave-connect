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
	openfga "github.com/openfga/go-sdk/client"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/wave-connect/sso-platform/apps/authz-service/internal/config"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/handler"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/middleware"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/service"
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

	// --- OpenFGA Client ---
	fgaClient, err := openfga.NewSdkClient(&openfga.ClientConfiguration{
		ApiUrl:  cfg.OpenFGA.APIURL,
		StoreId: cfg.OpenFGA.StoreID,
	})
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create OpenFGA client")
	}

	// --- Cache ---
	cacheSvc, err := service.NewCacheService(rdb, cfg.Cache.L1MaxItems, cfg.Cache.L1TTL, cfg.Cache.L2TTL, log)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create cache service")
	}
	defer cacheSvc.Close()

	// --- Services ---
	authzSvc := service.NewAuthzService(fgaClient, cacheSvc, log)

	// --- Repositories ---
	outboxRepo := repository.NewOutboxRepository(pool)

	// --- Outbox Worker ---
	outboxWorker := service.NewOutboxWorker(outboxRepo, authzSvc, cfg.Outbox.PollInterval, cfg.Outbox.BatchSize, log)

	// --- Handlers ---
	validate := validator.New()
	authzHandler := handler.NewAuthzHandler(authzSvc, validate, log)
	tupleHandler := handler.NewTupleHandler(authzSvc, validate, log)
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

	// --- Health Routes (no auth) ---
	app.Get("/healthz", healthHandler.Liveness)
	app.Get("/readyz", healthHandler.Readiness)

	// --- Protected Authz Routes ---
	authz := app.Group("/authz", middleware.PASETOAuth(cfg.Token.SymmetricKeyHex, log))
	authz.Post("/check", authzHandler.Check)
	authz.Post("/batch-check", authzHandler.BatchCheck)
	authz.Post("/list-objects", authzHandler.ListObjects)
	authz.Post("/tuples", tupleHandler.Write)
	authz.Delete("/tuples", tupleHandler.Delete)

	// --- Start Outbox Worker ---
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	go outboxWorker.Start(workerCtx)

	// --- Start HTTP Server ---
	go func() {
		addr := fmt.Sprintf(":%d", cfg.Server.Port)
		log.Info().Str("addr", addr).Msg("starting authz-service HTTP")
		if err := app.Listen(addr); err != nil {
			log.Fatal().Err(err).Msg("HTTP server failed")
		}
	}()

	// --- Graceful Shutdown ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down authz-service")
	workerCancel()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(ctx); err != nil {
		log.Error().Err(err).Msg("shutdown error")
	}
	log.Info().Msg("shutdown complete")
}
