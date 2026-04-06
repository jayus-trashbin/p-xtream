import Redis from 'ioredis';

let redis: Redis | null = null;

/**
 * Returns a lazy Redis singleton.
 * Returns null if REDIS_URL is not configured — callers must handle graceful degradation.
 */
export function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;

  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });
  }

  return redis;
}
