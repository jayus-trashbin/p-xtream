import { playerStatusStore, CLEANUP_INTERVAL } from '~/utils/playerStatus';
import { useAuth } from '~/utils/auth';
export default defineEventHandler(async event => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '');
  if (!token) throw createError({ statusCode: 401, message: 'Unauthorized' });

  const { verifySessionToken } = useAuth();
  const session = await verifySessionToken(token);
  if (!session) throw createError({ statusCode: 401, message: 'Invalid session' });
  const query = getQuery(event);
  const userId = query.userId as string;
  const roomCode = query.roomCode as string;

  // If roomCode is provided but no userId, return all statuses for that room
  if (roomCode && !userId) {
    const cutoffTime = Date.now() - CLEANUP_INTERVAL;
    const roomStatuses: Record<string, any[]> = {};

    for (const [key, statuses] of playerStatusStore.entries()) {
      if (key.includes(`:${roomCode}`)) {
        const userId = key.split(':')[0];
        const recentStatuses = statuses.filter(status => status.timestamp >= cutoffTime);

        if (recentStatuses.length > 0) {
          roomStatuses[userId] = recentStatuses;
        }
      }
    }

    return {
      roomCode,
      users: roomStatuses,
    };
  }

  // If both userId and roomCode are provided, return status for that user in that room
  if (userId && roomCode) {
    const key = `${userId}:${roomCode}`;
    const statuses = playerStatusStore.get(key) || [];

    // Remove statuses older than the cleanup interval (30 minutes)
    const cutoffTime = Date.now() - CLEANUP_INTERVAL;
    const recentStatuses = statuses.filter(status => status.timestamp >= cutoffTime);

    if (recentStatuses.length !== statuses.length) {
      playerStatusStore.set(key, recentStatuses);
    }

    return {
      userId,
      roomCode,
      statuses: recentStatuses,
    };
  }

  // If neither is provided, return error
  throw createError({
    statusCode: 400,
    statusMessage: 'Missing required query parameters: roomCode and/or userId',
  });
});
