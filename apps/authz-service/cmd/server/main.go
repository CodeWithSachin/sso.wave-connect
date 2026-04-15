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
	"github.com/jackc/pgx/v5/pgxpool"
	openfga "github.com/openfga/go-sdk/client"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	"github.com/wave-connect/sso-platform/apps/authz-service/internal/config"
	authzgrpc "github.com/wave-connect/sso-platform/apps/authz-service/internal/grpc"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/handler"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/middleware"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/repository"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/service"
	"github.com/wave-connect/sso-platform/apps/authz-service/internal/subscriber"
	ssonats "github.com/wave-connect/sso-platform/libs/nats"
	pb "github.com/wave-connect/sso-platform/libs/proto/gen/go/authz/v1"
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

	// --- L3 Permission Cache (PostgreSQL UNLOGGED fallback) ---
	l3Repo := repository.NewPermissionCacheRepository(pool)

	// --- Cache (L1 Ristretto + L2 Redis + L3 PostgreSQL) ---
	cacheSvc, err := service.NewCacheService(rdb, l3Repo, cfg.Cache.L1MaxItems, cfg.Cache.L1TTL, cfg.Cache.L2TTL, log)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create cache service")
	}
	defer cacheSvc.Close()

	// --- NATS ---
	natsClient, err := ssonats.Connect(ssonats.Config{URL: cfg.NATS.URL}, log)
	if err != nil {
		log.Warn().Err(err).Msg("NATS connection failed; cache invalidation disabled")
	} else {
		defer natsClient.Close()
		if err := subscriber.RegisterCacheInvalidation(natsClient, cacheSvc, log); err != nil {
			log.Warn().Err(err).Msg("failed to register NATS cache invalidation subscriber")
		}
	}

	// --- Services ---
	authzSvc := service.NewAuthzService(fgaClient, cacheSvc, natsClient, log)

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

	// --- Start gRPC Server ---
	grpcServer := grpc.NewServer()
	pb.RegisterAuthzServiceServer(grpcServer, authzgrpc.NewAuthzServer(authzSvc, log))
	reflection.Register(grpcServer) // Enable grpcurl / server reflection

	go func() {
		grpcAddr := fmt.Sprintf(":%d", cfg.GRPC.Port)
		lis, err := net.Listen("tcp", grpcAddr)
		if err != nil {
			log.Fatal().Err(err).Msg("gRPC listen failed")
		}
		log.Info().Str("addr", grpcAddr).Msg("starting authz-service gRPC")
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatal().Err(err).Msg("gRPC server failed")
		}
	}()

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
	grpcServer.GracefulStop()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(ctx); err != nil {
		log.Error().Err(err).Msg("shutdown error")
	}
	log.Info().Msg("shutdown complete")
}
