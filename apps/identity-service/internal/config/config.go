package config

import (
	"crypto/ed25519"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Server            ServerConfig
	Database          DatabaseConfig
	Redis             RedisConfig
	Token             TokenConfig
	Argon2            Argon2Config
	WebAuthn          WebAuthnConfig
	Cookie            CookieConfig
	WebhookServiceURL string `mapstructure:"webhook_service_url"`
	NATS              NATSConfig
}

type NATSConfig struct {
	URL string `mapstructure:"url"`
}

type CookieConfig struct {
	Domain string `mapstructure:"domain"` // "" for localhost dev, ".wave-connect.com" for prod
	Secure bool   `mapstructure:"secure"` // false for dev (HTTP), true for prod (HTTPS)
}

type WebAuthnConfig struct {
	RPID          string `mapstructure:"rp_id"`
	RPDisplayName string `mapstructure:"rp_display_name"`
	RPOrigin      string `mapstructure:"rp_origin"`
}

type ServerConfig struct {
	Port         int           `mapstructure:"port"`
	ReadTimeout  time.Duration `mapstructure:"read_timeout"`
	WriteTimeout time.Duration `mapstructure:"write_timeout"`
}

type DatabaseConfig struct {
	URL             string `mapstructure:"url"`
	MaxConns        int32  `mapstructure:"max_conns"`
	MinConns        int32  `mapstructure:"min_conns"`
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

type Argon2Config struct {
	Memory      uint32 `mapstructure:"memory"`
	Iterations  uint32 `mapstructure:"iterations"`
	Parallelism uint8  `mapstructure:"parallelism"`
	KeyLen      uint32 `mapstructure:"key_len"`
	SaltLen     uint32 `mapstructure:"salt_len"`
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
	v.AddConfigPath("/etc/identity-service")
	v.AutomaticEnv()

	// Server defaults
	v.SetDefault("server.port", 3000)
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

	// Argon2id defaults
	v.SetDefault("argon2.memory", 65536)
	v.SetDefault("argon2.iterations", 3)
	v.SetDefault("argon2.parallelism", 4)
	v.SetDefault("argon2.key_len", 32)
	v.SetDefault("argon2.salt_len", 16)

	// NATS defaults
	v.SetDefault("nats.url", "nats://localhost:4222")

	// SSO cookie defaults (dev: localhost HTTP, prod: .wave-connect.com HTTPS)
	v.SetDefault("cookie.domain", "localhost")
	v.SetDefault("cookie.secure", false)

	// Webhook service URL (empty = log-only, no webhook dispatch)
	v.SetDefault("webhook_service_url", "")

	// WebAuthn defaults
	v.SetDefault("webauthn.rp_id", "localhost")
	v.SetDefault("webauthn.rp_display_name", "WaveConnect SSO")
	v.SetDefault("webauthn.rp_origin", "http://localhost:4300")

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
	if err := v.UnmarshalKey("argon2", &cfg.Argon2); err != nil {
		return nil, fmt.Errorf("unmarshal argon2 config: %w", err)
	}
	if err := v.UnmarshalKey("webauthn", &cfg.WebAuthn); err != nil {
		return nil, fmt.Errorf("unmarshal webauthn config: %w", err)
	}
	if err := v.UnmarshalKey("cookie", &cfg.Cookie); err != nil {
		return nil, fmt.Errorf("unmarshal cookie config: %w", err)
	}

	if err := v.UnmarshalKey("nats", &cfg.NATS); err != nil {
		return nil, fmt.Errorf("unmarshal nats config: %w", err)
	}

	cfg.WebhookServiceURL = v.GetString("webhook_service_url")

	return cfg, nil
}
