import { describe, it, expect, beforeAll } from 'vitest';
import { signJwt, verifyJwt } from '../server/utils/jwt';

beforeAll(() => {
  // 64 hex chars = 32 bytes, minimum required
  process.env.CRYPTO_SECRET = 'a'.repeat(64);
});

describe('jwt utils', () => {
  it('signs a JWT and verifies it successfully', async () => {
    const payload = { sid: 'sess-123' };
    const token = await signJwt(payload);

    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // Valid JWT format

    const verified = await verifyJwt(token);
    expect(verified?.sid).toBe('sess-123');
  });

  it('returns null for an invalid token', async () => {
    const result = await verifyJwt('this.is.not.a.valid.jwt');
    expect(result).toBeNull();
  });

  it('returns null for an empty string', async () => {
    const result = await verifyJwt('');
    expect(result).toBeNull();
  });

  it('returns null for a tampered token', async () => {
    const token = await signJwt({ sid: 'sess-tampered' });
    const [header, , sig] = token.split('.');
    // Replace the payload with a different one
    const fakePayload = Buffer.from(JSON.stringify({ sid: 'evil-session' })).toString('base64url');
    const tamperedToken = `${header}.${fakePayload}.${sig}`;
    const result = await verifyJwt(tamperedToken);
    expect(result).toBeNull();
  });
});
