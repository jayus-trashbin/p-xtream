import type { Redis } from 'ioredis';

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

/**
 * Token-bucket rate limiter using Redis INCR + EXPIRE.
 * Falls back to allow-all when Redis is unavailable (dev mode).
 */
export async function checkRateLimit(
  redis: Redis | null,
  key: string,
  max: number,
  windowSec: number,
): Promise<RateLimitResult> {
  if (!redis) return { allowed: true, retryAfterMs: 0 };

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSec);
  }

  if (count > max) {
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfterMs: Math.max(ttl, 1) * 1000 };
  }

  return { allowed: true, retryAfterMs: 0 };
}
