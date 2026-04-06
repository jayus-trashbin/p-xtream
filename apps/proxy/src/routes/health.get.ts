import { getCacheStats } from './m3u8-proxy';

/**
 * GET /health
 * Structured health check endpoint for the CORS/M3U8 proxy.
 * Returns uptime, version, and cache statistics.
 * Compatible with load balancer health checks and monitoring systems.
 */
export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });

  return {
    status: 'ok',
    uptime: process.uptime(),
    version: process.env.npm_package_version ?? 'unknown',
    timestamp: new Date().toISOString(),
    cache: {
      enabled: process.env.ENABLE_CACHE === 'true',
      ...getCacheStats(),
    },
  };
});
