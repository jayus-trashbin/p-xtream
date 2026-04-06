import { Sourcerer } from '@/providers/base';

export interface ProviderHealthResult {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  checkedAt: string;
  error?: string;
}

// Well-known stable test media — these should always exist on TMDB
const TEST_MOVIE = {
  type: 'movie' as const,
  title: 'Expend4bles',
  releaseYear: 2023,
  tmdbId: '299054',
  imdbId: 'tt3291150',
};

const TEST_SHOW = {
  type: 'show' as const,
  title: 'Breaking Bad',
  releaseYear: 2008,
  tmdbId: '1396',
  imdbId: 'tt0903747',
  episode: {
    season: 1,
    number: 1,
    tmdbId: '349232',
    title: 'Pilot',
    releaseYear: 2008,
  },
  season: {
    number: 1,
    tmdbId: '3572',
  },
};

const HEALTH_CHECK_TIMEOUT_MS = 10_000;

/**
 * Checks the health of a single source provider by attempting a real scrape.
 * Returns 'healthy' if streams were found, 'degraded' if the scrape ran but found nothing,
 * and 'down' if the scrape threw an error or timed out.
 */
export async function checkProviderHealth(provider: Sourcerer): Promise<ProviderHealthResult> {
  const start = Date.now();

  // Create a minimal context for health checks — no proxy, no events
  const ctx = {
    fetcher: async (url: string) => {
      const res = await fetch(url);
      return res.text();
    },
    proxiedFetcher: async (url: string) => {
      const res = await fetch(url);
      return res.text();
    },
    progress: () => {},
    features: {
      requires: [],
      compatible: [],
    },
  } as any; // cast: health check doesn't need full typing

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout after 10s')), HEALTH_CHECK_TIMEOUT_MS),
  );

  try {
    const scrapePromise = provider.scrapeMovie
      ? provider.scrapeMovie({ ...ctx, media: TEST_MOVIE })
      : provider.scrapeShow
        ? provider.scrapeShow({ ...ctx, media: TEST_SHOW })
        : Promise.resolve(null);

    const result = await Promise.race([scrapePromise, timeoutPromise]);

    const hasOutput =
      result &&
      ((result.stream && result.stream.length > 0) || (result.embeds && result.embeds.length > 0));

    return {
      id: provider.id,
      name: provider.name,
      status: hasOutput ? 'healthy' : 'degraded',
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      id: provider.id,
      name: provider.name,
      status: 'down',
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
