package config

import (
	"crypto/ed25519"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Server         ServerConfig
	Database       DatabaseConfig
	Redis          RedisConfig
	Token          TokenConfig
	AuthzService   AuthzServiceConfig
	LoginPortalURL string `mapstructure:"login_portal_url"`
}

type ServerConfig struct {
	Port         int           `mapstructure:"port"`
	ReadTimeout  time.Duration `mapstructure:"read_timeout"`
	WriteTimeout time.Duration `mapstructure:"write_timeout"`
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

type TokenConfig struct {
	SymmetricKeyHex string        `mapstructure:"symmetric_key_hex"`
	PrivateKeyHex   string        `mapstructure:"private_key_hex"`
	Issuer          string        `mapstructure:"issuer"`
	AccessTTL       time.Duration `mapstructure:"access_ttl"`
	RefreshTTL      time.Duration `mapstructure:"refresh_ttl"`
	IDTTL           time.Duration `mapstructure:"id_ttl"`
}

type AuthzServiceConfig struct {
	URL string `mapstructure:"url"`
}

func (tc *TokenConfig) Ed25519PrivateKey() (ed25519.PrivateKey, error) {
	b, err := hex.DecodeString(tc.PrivateKeyHex)
	if err != nil {
		return nil, fmt.Errorf("decode private key hex: %w", err)
	}
	if len(b) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("private key must be %d bytes, got %d", ed25519.PrivateKeySize, len(b))
	}
	return ed25519.PrivateKey(b), nil
}

func (tc *TokenConfig) Ed25519PublicKey() (ed25519.PublicKey, error) {
	priv, err := tc.Ed25519PrivateKey()
	if err != nil {
		return nil, err
	}
	return priv.Public().(ed25519.PublicKey), nil
}

func Load() (*Config, error) {
	v := viper.New()
	v.SetConfigName("config")
	v.SetConfigType("yaml")
	v.AddConfigPath(".")
	v.AddConfigPath("/etc/sso-service")
	v.AutomaticEnv()

	// Server defaults
	v.SetDefault("server.port", 8082)
	v.SetDefault("server.read_timeout", 10*time.Second)
	v.SetDefault("server.write_timeout", 10*time.Second)

	// Database defaults
	v.SetDefault("database.url", "postgres://app_readwrite:dev@localhost:5433/sso_dev?sslmode=disable")
	v.SetDefault("database.max_conns", 20)
	v.SetDefault("database.min_conns", 5)
	v.SetDefault("database.max_conn_lifetime", 30*time.Minute)

	// Redis defaults
	v.SetDefault("redis.url", "redis://localhost:6379/0")

	// Token defaults
	v.SetDefault("token.issuer", "https://sso.wave-connect.com")
	v.SetDefault("token.access_ttl", 15*time.Minute)
	v.SetDefault("token.refresh_ttl", 30*24*time.Hour)
	v.SetDefault("token.id_ttl", 1*time.Hour)

	// AuthzService defaults
	v.SetDefault("authz_service.url", "http://localhost:8081")

	// Login portal URL — where to redirect unauthenticated users
	v.SetDefault("login_portal_url", "http://localhost:4200/login")

	_ = v.ReadInConfig() // Not fatal if config file is missing; env vars suffice

	cfg := &Config{}
	if err := v.UnmarshalKey("server", &cfg.Server); err != nil {
		return nil, fmt.Errorf("unmarshal server config: %w", err)
	}
	if err := v.UnmarshalKey("database", &cfg.Database); err != nil {
		return nil, fmt.Errorf("unmarshal database config: %w", err)
	}
	if err := v.UnmarshalKey("redis", &cfg.Redis); err != nil {
		return nil, fmt.Errorf("unmarshal redis config: %w", err)
	}
	if err := v.UnmarshalKey("token", &cfg.Token); err != nil {
		return nil, fmt.Errorf("unmarshal token config: %w", err)
	}
	if err := v.UnmarshalKey("authz_service", &cfg.AuthzService); err != nil {
		return nil, fmt.Errorf("unmarshal authz_service config: %w", err)
	}

	cfg.LoginPortalURL = v.GetString("login_portal_url")

	return cfg, nil
}
