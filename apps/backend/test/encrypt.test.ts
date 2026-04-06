import { describe, it, expect, beforeAll } from 'vitest';
import { encryptToken, decryptToken } from '../server/utils/encrypt';

beforeAll(() => {
  // 64 hex chars = 32 bytes key
  process.env.CRYPTO_SECRET = 'deadbeef'.repeat(8);
});

describe('encryptToken / decryptToken', () => {
  it('roundtrips a plaintext string correctly', async () => {
    const original = 'my-super-secret-debrid-token';
    const encrypted = await encryptToken(original);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  it('produces different ciphertext for the same input (random nonce)', async () => {
    const plaintext = 'same-token';
    const enc1 = await encryptToken(plaintext);
    const enc2 = await encryptToken(plaintext);
    expect(enc1).not.toBe(enc2);
    // But both decrypt to the same value
    expect(decryptToken(enc1)).toBe(plaintext);
    expect(decryptToken(enc2)).toBe(plaintext);
  });

  it('produces ciphertext in hex(nonce):hex(ciphertext) format', async () => {
    const encrypted = await encryptToken('test');
    expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it('throws on malformed encrypted string', () => {
    expect(() => decryptToken('notvalidformat')).toThrow();
  });

  it('throws on tampered ciphertext', async () => {
    const encrypted = await encryptToken('original');
    const [nonce, cipher] = encrypted.split(':');
    // Flip the last byte of the ciphertext
    const tampered = `${nonce}:${cipher!.slice(0, -2)}ff`;
    expect(() => decryptToken(tampered)).toThrow();
  });
});
