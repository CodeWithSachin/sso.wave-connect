# PASETO v4 Tokens

The SSO platform uses PASETO (Platform-Agnostic Security Tokens) instead of JWT.

## Why PASETO?

- No algorithm confusion attacks (unlike JWT's `alg` header)
- Built-in encryption with `v4.local`
- Best-in-class cryptography: XChaCha20 + BLAKE2b + Ed25519

## Token Types

| Type | Format | Use Case |
|------|--------|----------|
| Access Token | `v4.local` | Encrypted, inter-service auth |
| Refresh Token | `v4.local` | Encrypted, token rotation |
| ID Token | `v4.public` | Signed, client-readable user info |

## v4.local (Encrypted)
- Symmetric encryption (XChaCha20-Poly1305)
- Payload is NOT visible to clients
- Used for access + refresh tokens

## v4.public (Signed)
- Asymmetric signing (Ed25519)
- Payload IS visible but tamper-proof
- Used for ID tokens shared with third parties
