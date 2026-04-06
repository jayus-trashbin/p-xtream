import { customAlphabet } from 'nanoid';
import { verifyJwt } from '~/utils/jwt';
import { getRedis } from '~/utils/redis';

// 6 uppercase alphanumeric = ~2.2 billion combinations
const generateRoomCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);
export { generateRoomCode };

const ROOM_TTL = 30 * 60; // 30 minutes in seconds

export default defineWebSocketHandler({
  async open(peer) {
    const params = peer.request?.url ? new URL(peer.request.url, 'http://localhost').searchParams : null;
    const roomCode = params?.get('roomCode');
    const token = params?.get('token');

    if (!roomCode || !token) {
      peer.close(4001, 'Missing roomCode or token');
      return;
    }

    const payload = await verifyJwt(token);
    if (!payload) {
      peer.close(4003, 'Unauthorized');
      return;
    }

    peer.subscribe(`room:${roomCode}`);

    const redis = getRedis();
    if (redis) {
      await redis.setex(
        `room:${roomCode}:user:${payload.sid}`,
        ROOM_TTL,
        JSON.stringify({ joined: Date.now() })
      );
    }
  },

  async message(peer, msg) {
    const params = peer.request?.url ? new URL(peer.request.url, 'http://localhost').searchParams : null;
    const roomCode = params?.get('roomCode');
    if (!roomCode) return;

    let data: { type: string; payload: unknown };
    try {
      data = msg.json<typeof data>();
    } catch {
      return; // Ignore malformed messages
    }

    if (data.type === 'player:update') {
      peer.publish(`room:${roomCode}`, JSON.stringify(data));

      const redis = getRedis();
      if (redis) {
        await redis.setex(
          `room:${roomCode}:status`,
          ROOM_TTL,
          JSON.stringify(data.payload)
        );
      }
    } else if (data.type === 'ping') {
      peer.send(JSON.stringify({ type: 'pong' }));
    }
  },

  async close(peer) {
    const params = peer.request?.url ? new URL(peer.request.url, 'http://localhost').searchParams : null;
    const roomCode = params?.get('roomCode');
    const token = params?.get('token');
    if (!roomCode || !token) return;

    const payload = await verifyJwt(token);
    if (!payload) return;

    const redis = getRedis();
    if (redis) {
      await redis.del(`room:${roomCode}:user:${payload.sid}`);
    }

    peer.publish(
      `room:${roomCode}`,
      JSON.stringify({ type: 'user:left', userId: payload.sid })
    );
  },
});
