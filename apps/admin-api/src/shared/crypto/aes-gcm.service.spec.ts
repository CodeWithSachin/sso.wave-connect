import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'crypto';
import { AesGcmService } from './aes-gcm.service';

const ORIGINAL_KEY = process.env.OIDC_SECRET_KEY;

function withKey(keyBytes = 32): AesGcmService {
  process.env.OIDC_SECRET_KEY = randomBytes(keyBytes).toString('base64');
  const svc = new AesGcmService();
  svc.onModuleInit();
  return svc;
}

describe('AesGcmService', () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.OIDC_SECRET_KEY;
    } else {
      process.env.OIDC_SECRET_KEY = ORIGINAL_KEY;
    }
  });

  describe('initialization', () => {
    it('throws if OIDC_SECRET_KEY is missing', () => {
      delete process.env.OIDC_SECRET_KEY;
      const svc = new AesGcmService();
      expect(() => svc.onModuleInit()).toThrow(/OIDC_SECRET_KEY env var is required/);
    });

    it('throws if key decodes to wrong length', () => {
      process.env.OIDC_SECRET_KEY = randomBytes(16).toString('base64'); // 128 bits, not 256
      const svc = new AesGcmService();
      expect(() => svc.onModuleInit()).toThrow(/must decode to 32 bytes/);
    });
  });

  describe('round-trip', () => {
    let svc: AesGcmService;
    beforeEach(() => {
      svc = withKey();
    });

    it('encrypts and decrypts a normal secret', () => {
      const plaintext = 'super-secret-oidc-client-secret-abc123';
      const ct = svc.encrypt(plaintext);
      expect(ct.startsWith('v1:')).toBe(true);
      expect(ct).not.toContain(plaintext);
      expect(svc.decrypt(ct)).toBe(plaintext);
    });

    it('emits a distinct ciphertext per encryption (random IV)', () => {
      const plaintext = 'identical-input';
      const a = svc.encrypt(plaintext);
      const b = svc.encrypt(plaintext);
      expect(a).not.toBe(b);
      expect(svc.decrypt(a)).toBe(plaintext);
      expect(svc.decrypt(b)).toBe(plaintext);
    });

    it('handles unicode + long strings', () => {
      const plaintext = '🔐 ' + 'x'.repeat(2048) + ' ✅';
      expect(svc.decrypt(svc.encrypt(plaintext))).toBe(plaintext);
    });

    it('refuses to encrypt an empty string (caller bug)', () => {
      expect(() => svc.encrypt('')).toThrow();
    });
  });

  describe('tamper detection', () => {
    let svc: AesGcmService;
    beforeEach(() => {
      svc = withKey();
    });

    it('rejects a flipped ciphertext byte', () => {
      const ct = svc.encrypt('protected-payload');
      const parts = ct.split(':');
      // Flip a bit in the payload — should fail GCM auth.
      const payload = Buffer.from(parts[2], 'base64url');
      payload[0] ^= 0x01;
      parts[2] = payload.toString('base64url');
      expect(() => svc.decrypt(parts.join(':'))).toThrow();
    });

    it('rejects an unknown version prefix with the same opaque message', () => {
      const ct = svc.encrypt('x');
      const tampered = ct.replace(/^v1:/, 'v2:');
      // External message is intentionally non-specific — see decrypt() comment.
      expect(() => svc.decrypt(tampered)).toThrow(/Failed to decrypt stored secret/);
    });

    it('rejects malformed tokens with the same opaque message', () => {
      expect(() => svc.decrypt('v1:onlytwo')).toThrow(/Failed to decrypt stored secret/);
      expect(() => svc.decrypt('garbage')).toThrow(/Failed to decrypt stored secret/);
    });

    it('rejects a ciphertext encrypted under a different key', () => {
      const ctA = svc.encrypt('secret');
      const svcB = withKey();
      expect(() => svcB.decrypt(ctA)).toThrow();
    });
  });

  describe('isEncrypted', () => {
    it('detects v1 tokens; rejects plaintext and falsy values', () => {
      const svc = withKey();
      expect(svc.isEncrypted(svc.encrypt('x'))).toBe(true);
      expect(svc.isEncrypted('plain-secret')).toBe(false);
      expect(svc.isEncrypted('')).toBe(false);
      expect(svc.isEncrypted(null)).toBe(false);
      expect(svc.isEncrypted(undefined)).toBe(false);
    });
  });
});
