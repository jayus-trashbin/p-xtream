import { defineEventHandler, readBody, createError, getHeader } from 'h3';
import { playerStatusStore, PlayerStatus } from '~/utils/playerStatus';
import { verifySession } from '~/utils/auth';

export default defineEventHandler(async event => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '');
  if (!token) throw createError({ statusCode: 401, message: 'Unauthorized' });

  const session = await verifySession(token);
  if (!session) throw createError({ statusCode: 401, message: 'Invalid session' });

  const body = await readBody(event);

  if (body.userId !== session.userId) {
    throw createError({ statusCode: 403, message: 'userId mismatch' });
  }

  if (!body || !body.userId || !body.roomCode) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields: userId, roomCode',
    });
  }

  const status: PlayerStatus = {
    userId: body.userId,
    roomCode: body.roomCode,
    isHost: body.isHost || false,
    content: {
      title: body.content?.title || 'Unknown',
      type: body.content?.type || 'Unknown',
      tmdbId: body.content?.tmdbId,
      seasonId: body.content?.seasonId,
      episodeId: body.content?.episodeId,
      seasonNumber: body.content?.seasonNumber,
      episodeNumber: body.content?.episodeNumber,
    },
    player: {
      isPlaying: body.player?.isPlaying || false,
      isPaused: body.player?.isPaused || false,
      isLoading: body.player?.isLoading || false,
      hasPlayedOnce: body.player?.hasPlayedOnce || false,
      time: body.player?.time || 0,
      duration: body.player?.duration || 0,
      volume: body.player?.volume || 0,
      playbackRate: body.player?.playbackRate || 1,
      buffered: body.player?.buffered || 0,
    },
    timestamp: Date.now(),
  };

  const key = `${status.userId}:${status.roomCode}`;
  const existingStatuses = playerStatusStore.get(key) || [];

  // Add new status and keep only the last 5 statuses
  existingStatuses.push(status);
  if (existingStatuses.length > 5) {
    existingStatuses.shift();
  }

  playerStatusStore.set(key, existingStatuses);

  return { success: true, timestamp: status.timestamp };
});
