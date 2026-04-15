/**
 * PKCE (Proof Key for Code Exchange) utilities using the Web Crypto API.
 * Used by the auth guard to generate a code challenge for the OAuth2 authorize redirect.
 */

function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) {
    str += String.fromCharCode(b);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generates a cryptographically random code verifier (43-128 chars, base64url).
 */
export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32).buffer as ArrayBuffer);
}

/**
 * Generates a SHA-256 code challenge from the verifier (S256 method).
 */
export async function generateCodeChallenge(
  verifier: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

/**
 * Generates a cryptographically random state parameter for CSRF protection.
 */
export function generateState(): string {
  return base64UrlEncode(randomBytes(16).buffer as ArrayBuffer);
}
