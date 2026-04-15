package config

import (
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Redis    RedisConfig
	OpenFGA  OpenFGAConfig
	Token    TokenConfig
	Cache    CacheConfig
	Outbox   OutboxConfig
	GRPC     GRPCConfig
	NATS     NATSConfig
}

type NATSConfig struct {
	URL string `mapstructure:"url"`
}

type ServerConfig struct {
	Port         int           `mapstructure:"port"`
	ReadTimeout  time.Duration `mapstructure:"read_timeout"`
	WriteTimeout time.Duration `mapstructure:"write_timeout"`
}

type GRPCConfig struct {
	Port int `mapstructure:"port"`
}

type DatabaseConfig struct {
	URL             string        `mapstructure:"url"`
	MaxConns        int32         `mapstructure:"max_conns"`
	MinConns        int32         `mapstructure:"min_conns"`
	MaxConnLifetime time.Duration `mapstructure:"max_conn_lifetime"`
}

type RedisConfig struct {
	URL string `mapstructure:"url"`
}

type OpenFGAConfig struct {
	APIURL  string `mapstructure:"api_url"`
	StoreID string `mapstructure:"store_id"`
}

type TokenConfig struct {
	SymmetricKeyHex string `mapstructure:"symmetric_key_hex"`
}

type CacheConfig struct {
	L1MaxItems int64         `mapstructure:"l1_max_items"`
	L1TTL      time.Duration `mapstructure:"l1_ttl"`
	L2TTL      time.Duration `mapstructure:"l2_ttl"`
}

type OutboxConfig struct {
	PollInterval time.Duration `mapstructure:"poll_interval"`
	BatchSize    int           `mapstructure:"batch_size"`
}

func Load() (*Config, error) {
	v := viper.New()
	v.SetConfigName("config")
	v.SetConfigType("yaml")
	v.AddConfigPath(".")
	v.AddConfigPath("/etc/authz-service")
	v.AutomaticEnv()

	// Server defaults
	v.SetDefault("server.port", 8080)
	v.SetDefault("server.read_timeout", 10*time.Second)
	v.SetDefault("server.write_timeout", 10*time.Second)

	// gRPC defaults
	v.SetDefault("grpc.port", 50051)

	// NATS defaults
	v.SetDefault("nats.url", "nats://localhost:4222")

	// Database defaults
	v.SetDefault("database.url", "postgres://app_readwrite:dev@localhost:5433/sso_dev?sslmode=disable")
	v.SetDefault("database.max_conns", 10)
	v.SetDefault("database.min_conns", 2)
	v.SetDefault("database.max_conn_lifetime", 30*time.Minute)

	// Redis defaults
	v.SetDefault("redis.url", "redis://localhost:6379/1")

	// OpenFGA defaults
	v.SetDefault("openfga.api_url", "http://localhost:8080")
	v.SetDefault("openfga.store_id", "")

	// Cache defaults
	v.SetDefault("cache.l1_max_items", int64(10000))
	v.SetDefault("cache.l1_ttl", 5*time.Minute)
	v.SetDefault("cache.l2_ttl", 15*time.Minute)

	// Outbox defaults
	v.SetDefault("outbox.poll_interval", 2*time.Second)
	v.SetDefault("outbox.batch_size", 50)

	_ = v.ReadInConfig()

	cfg := &Config{}
	for _, pair := range []struct {
		key  string
		dest interface{}
	}{
		{"server", &cfg.Server},
		{"grpc", &cfg.GRPC},
		{"database", &cfg.Database},
		{"redis", &cfg.Redis},
		{"openfga", &cfg.OpenFGA},
		{"token", &cfg.Token},
		{"cache", &cfg.Cache},
		{"outbox", &cfg.Outbox},
		{"nats", &cfg.NATS},
	} {
		if err := v.UnmarshalKey(pair.key, pair.dest); err != nil {
			return nil, err
		}
	}

	return cfg, nil
}
