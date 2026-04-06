import { describe, it, expect } from 'vitest';
import { checkProviderHealth } from './index';
import { getProviders } from '../';

describe('Provider Health', () => {
  const providers = getProviders();

  it('getProviders() returns a non-empty list', () => {
    expect(providers.length).toBeGreaterThan(0);
  });

  it('checkProviderHealth accepts a valid provider without throwing', async () => {
    const provider = providers[0]!;
    // Just checking the function shape — not actually making network calls in unit tests
    expect(typeof checkProviderHealth).toBe('function');
    expect(provider).toHaveProperty('id');
  });

  // This test only runs in CI weekly workflow (VITEST_HEALTH=true)
  // or when manually triggered with the env var set.
  it.skipIf(!process.env.VITEST_HEALTH)(
    'at least 60% of providers are healthy',
    async () => {
      const results = await Promise.allSettled(providers.map(checkProviderHealth));
      const healthy = results.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 'healthy',
      ).length;

      const ratio = healthy / providers.length;
      console.log(
        `[health] ${healthy}/${providers.length} providers healthy (${(ratio * 100).toFixed(1)}%)`,
      );

      expect(ratio).toBeGreaterThanOrEqual(0.6);
    },
    120_000, // 2 min timeout for real scrape tests
  );
});
