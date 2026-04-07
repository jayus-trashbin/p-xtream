import { createError } from 'h3';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory store — sufficient for single instance; swap for Redis in Phase 2 WebSocket
const attempts = new Map<string, RateLimitRecord>();

/**
 * Checks if a key has exceeded the rate limit.
 * Throws HTTP 429 if the limit is exceeded.
 *
 * @param key     - Unique identifier (e.g. `auth:<ip>`)
 * @param maxAttempts - Max allowed attempts within the window
 * @param windowMs    - Time window in milliseconds
 */
export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): void {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || record.resetAt < now) {
    // First attempt in this window — reset counter
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (record.count >= maxAttempts) {
    throw createError({
      statusCode: 429,
      message: 'Too many attempts. Please try again later.',
    });
  }

  record.count += 1;
}

/**
 * Clears expired entries from the in-memory store.
 * Call periodically to prevent memory growth.
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, record] of attempts.entries()) {
    if (record.resetAt < now) attempts.delete(key);
  }
}

// Automatically cleanup every 60 seconds
setInterval(cleanupRateLimitStore, 60000).unref();
