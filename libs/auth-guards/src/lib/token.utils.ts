/**
 * Utilities for working with PASETO v4.public tokens.
 *
 * PASETO v4.local tokens are encrypted and cannot be decoded client-side.
 * PASETO v4.public tokens have the structure: v4.public.<payload>.<footer>
 * where the payload is base64url-encoded and contains the claims after
 * stripping the Ed25519 signature (last 64 bytes).
 */

/**
 * Decodes a base64url string to a UTF-8 string.
 */
function base64UrlDecode(input: string): string {
  // Replace base64url characters with standard base64
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  const pad = base64.length % 4;
  if (pad === 2) {
    base64 += '==';
  } else if (pad === 3) {
    base64 += '=';
  }

  return atob(base64);
}

/**
 * Extracts the payload from a PASETO v4.public token.
 *
 * Token format: v4.public.<base64url-encoded signed payload>.<optional footer>
 * The signed payload contains the JSON claims followed by a 64-byte Ed25519 signature.
 *
 * Returns null for v4.local tokens (encrypted, cannot be decoded client-side)
 * or if the token format is invalid.
 */
export function getTokenPayload(
  token: string,
): Record<string, unknown> | null {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }

    const parts = token.split('.');

    // Must be v4.public token with at least 3 parts
    if (parts.length < 3 || parts[0] !== 'v4' || parts[1] !== 'public') {
      return null;
    }

    const signedPayload = parts[2];
    if (!signedPayload) {
      return null;
    }

    // Decode the base64url payload
    const decoded = base64UrlDecode(signedPayload);

    // The Ed25519 signature is the last 64 bytes; the JSON claims precede it
    if (decoded.length <= 64) {
      return null;
    }

    const jsonStr = decoded.substring(0, decoded.length - 64);
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Checks whether a PASETO v4.public token is expired.
 *
 * Parses the `exp` claim from the token payload and compares it
 * to the current time. Returns true if the token is expired or
 * if the payload cannot be decoded (fail-closed).
 *
 * For v4.local (encrypted) tokens this always returns true since
 * we cannot inspect the payload client-side.
 */
export function isTokenExpired(token: string): boolean {
  const payload = getTokenPayload(token);

  if (!payload || !payload['exp']) {
    // Fail closed: treat un-decodable tokens as expired
    return true;
  }

  const exp = payload['exp'];

  let expiryMs: number;

  if (typeof exp === 'string') {
    // PASETO uses ISO 8601 date strings for exp
    expiryMs = new Date(exp).getTime();
  } else if (typeof exp === 'number') {
    // Fallback: numeric epoch seconds (JWT-style)
    expiryMs = exp * 1000;
  } else {
    return true;
  }

  if (isNaN(expiryMs)) {
    return true;
  }

  return Date.now() >= expiryMs;
}
