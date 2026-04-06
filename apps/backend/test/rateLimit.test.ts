import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit } from '../server/utils/rateLimit';

// Access the internal map for test isolation via module re-import trick
// We use vi.resetModules() to get a fresh module per test
describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    expect(() => checkRateLimit('test:ip1', 3, 60_000)).not.toThrow();
    expect(() => checkRateLimit('test:ip1', 3, 60_000)).not.toThrow();
    expect(() => checkRateLimit('test:ip1', 3, 60_000)).not.toThrow();
  });

  it('throws 429 when the limit is exceeded', () => {
    const key = 'test:ip2';
    // Fill up the limit
    checkRateLimit(key, 2, 60_000);
    checkRateLimit(key, 2, 60_000);

    // This one should throw
    expect(() => checkRateLimit(key, 2, 60_000)).toThrowError(/429|Too many/i);
  });

  it('resets the counter after the window expires', async () => {
    const key = 'test:ip3';
    // Use a very short window (1ms)
    checkRateLimit(key, 1, 1);
    checkRateLimit(key, 1, 1); // Should hit limit

    // Wait for the window to expire
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Should be allowed again after window reset
    expect(() => checkRateLimit(key, 1, 1)).not.toThrow();
  });

  it('uses different buckets for different keys', () => {
    checkRateLimit('test:ip4', 1, 60_000);
    // Different key — should not be affected
    expect(() => checkRateLimit('test:ip5', 1, 60_000)).not.toThrow();
  });
});
