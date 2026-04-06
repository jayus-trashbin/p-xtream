import { describe, it, expect, beforeAll } from 'vitest';
import { encryptToken, decryptToken } from './encrypt';

// CRYPTO_SECRET must be >= 32 chars hex for AES-256-GCM
beforeAll(() => {
  process.env.CRYPTO_SECRET = 'a'.repeat(64);
});

describe('encryptToken / decryptToken', () => {
  it('round-trips a token correctly', () => {
    const original = 'my-secret-api-key';
    const encrypted = encryptToken(original);
    expect(decryptToken(encrypted)).toBe(original);
  });

  it('encrypted output is different from plain text', () => {
    const original = 'my-secret-api-key';
    const encrypted = encryptToken(original);
    expect(encrypted).not.toBe(original);
  });

  it('produces different ciphertext for same input (random nonce)', () => {
    const a = encryptToken('same-input');
    const b = encryptToken('same-input');
    // Different nonce → different ciphertext, but same plaintext after decrypt
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe('same-input');
    expect(decryptToken(b)).toBe('same-input');
  });

  it('throws or returns null for tampered ciphertext', () => {
    expect(() => decryptToken('not-a-valid-ciphertext')).toThrow();
  });
});
