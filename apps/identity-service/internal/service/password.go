package service

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"

	"golang.org/x/crypto/argon2"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/config"
)

type PasswordService struct {
	cfg config.Argon2Config
}

func NewPasswordService(cfg config.Argon2Config) *PasswordService {
	return &PasswordService{cfg: cfg}
}

func (s *PasswordService) Hash(password string) (string, error) {
	salt := make([]byte, s.cfg.SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	hash := argon2.IDKey(
		[]byte(password),
		salt,
		s.cfg.Iterations,
		s.cfg.Memory,
		s.cfg.Parallelism,
		s.cfg.KeyLen,
	)

	// Encode as: $argon2id$v=19$m=MEMORY,t=ITER,p=PAR$SALT$HASH
	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, s.cfg.Memory, s.cfg.Iterations, s.cfg.Parallelism, b64Salt, b64Hash,
	), nil
}

func (s *PasswordService) Verify(password, encoded string) (bool, error) {
	var version int
	var memory, iterations uint32
	var parallelism uint8
	var b64Salt, b64Hash string

	_, err := fmt.Sscanf(encoded, "$argon2id$v=%d$m=%d,t=%d,p=%d$%s",
		&version, &memory, &iterations, &parallelism, &b64Salt,
	)
	if err != nil {
		return false, fmt.Errorf("parse hash: %w", err)
	}

	// Split b64Salt which actually contains "salt$hash"
	parts := splitOnDollar(b64Salt)
	if len(parts) != 2 {
		return false, fmt.Errorf("invalid hash format")
	}
	b64Salt = parts[0]
	b64Hash = parts[1]

	salt, err := base64.RawStdEncoding.DecodeString(b64Salt)
	if err != nil {
		return false, fmt.Errorf("decode salt: %w", err)
	}

	expectedHash, err := base64.RawStdEncoding.DecodeString(b64Hash)
	if err != nil {
		return false, fmt.Errorf("decode hash: %w", err)
	}

	computedHash := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(expectedHash)))

	return subtle.ConstantTimeCompare(computedHash, expectedHash) == 1, nil
}

func splitOnDollar(s string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '$' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}
