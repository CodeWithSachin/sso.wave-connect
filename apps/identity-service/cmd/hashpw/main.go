// Package main is a tiny CLI for producing argon2id password hashes that
// match identity-service's password.go output. Exists because the admin
// seed (apps/admin-api/prisma/seed.ts) bakes in a pre-computed hash for
// the dev admin user — and re-computing that hash should not require a
// throw-away Go file under /tmp.
//
// Usage:
//
//	cd apps/identity-service && go run ./cmd/hashpw "Admin123!"
//	→ $argon2id$v=19$m=65536,t=3,p=4$<base64-salt>$<base64-hash>
//
// Parameters are the production defaults from config.yaml:
//
//	memory:      65536
//	iterations:  3
//	parallelism: 4
//	keyLen:      32
//	saltLen:     16
//
// The salt is freshly random per invocation; that's fine because seed.ts
// stores the encoded string verbatim and the Verify path reads salt out
// of it.
//
// This binary is intentionally NOT registered as an nx target. It's a
// developer convenience invoked once per password rotation. Production
// passwords are NEVER produced this way — they're hashed at registration
// time inside service.PasswordService.
package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"

	"golang.org/x/crypto/argon2"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: hashpw <password>")
		os.Exit(2)
	}
	password := os.Args[1]
	if password == "" {
		fmt.Fprintln(os.Stderr, "password must not be empty")
		os.Exit(2)
	}

	// MUST stay in sync with apps/identity-service/config.yaml::argon2.
	// Any divergence here means a hash this tool prints won't verify in
	// the running service, which silently breaks the seeded login.
	const (
		memory      uint32 = 65536
		iterations  uint32 = 3
		parallelism uint8  = 4
		keyLen      uint32 = 32
		saltLen            = 16
	)

	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		fmt.Fprintln(os.Stderr, "rand.Read:", err)
		os.Exit(1)
	}
	hash := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, keyLen)

	fmt.Printf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s\n",
		argon2.Version, memory, iterations, parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	)
}
