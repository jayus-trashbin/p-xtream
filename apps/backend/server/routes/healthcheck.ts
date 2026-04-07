import { prisma } from '../utils/prisma';
import { getRedis } from '../utils/redis';
import { version } from '../utils/config';

export default defineEventHandler(async event => {
  let dbStatus = 'down';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'up';
  } catch (e) {
    dbStatus = 'error';
  }

  let redisStatus = 'skipped';
  const redis = getRedis();
  if (redis) {
    try {
      await redis.ping();
      redisStatus = 'up';
    } catch (e) {
      redisStatus = 'error';
    }
  }

  const isHealthy = dbStatus === 'up' && (redisStatus === 'up' || redisStatus === 'skipped');

  if (!isHealthy) {
    event.node.res.statusCode = 503;
  }

  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
  };
});
