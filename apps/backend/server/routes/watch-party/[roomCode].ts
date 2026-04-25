import { customAlphabet } from 'nanoid';
import { verifyJwt } from '~/utils/jwt';
import { getRedis } from '~/utils/redis';
import { isValidReactionEmoji, sanitizeChatText } from '~/utils/wsAllowlist';
import { checkRateLimit } from '~/utils/wsRateLimit';

// 6 uppercase alphanumeric = ~2.2 billion combinations
const generateRoomCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);
export { generateRoomCode };

const ROOM_TTL = 30 * 60; // 30 minutes in seconds

// Helper to extract roomCode + verified JWT payload from a peer
async function getPeerContext(peer: any) {
  const params = peer.request?.url
    ? new URL(peer.request.url, 'http://localhost').searchParams
    : null;
  const roomCode = params?.get('roomCode');
  const token = params?.get('token');
  if (!roomCode || !token) return null;
  const payload = await verifyJwt(token);
  if (!payload) return null;
  return { roomCode, token, payload };
}

function generateMsgId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default defineWebSocketHandler({
  async open(peer) {
    const ctx = await getPeerContext(peer);
    if (!ctx) {
      peer.close(4001, 'Missing or invalid credentials');
      return;
    }
    const { roomCode, payload } = ctx;
    const sid = payload.sid as string;

    peer.subscribe(`room:${roomCode}`);

    const redis = getRedis();

    if (redis) {
      // Determine if this peer is the host (first member or declared via presence:hello)
      const existingHost = await redis.get(`room:${roomCode}:host`);

      await redis.setex(
        `room:${roomCode}:user:${sid}`,
        ROOM_TTL,
        JSON.stringify({ joined: Date.now(), isHost: !existingHost }),
      );

      // First peer to connect becomes host
      if (!existingHost) {
        await redis.setex(`room:${roomCode}:host`, ROOM_TTL, sid);
      }

      // Send presence snapshot to the new peer
      const memberKeys = await redis.keys(`room:${roomCode}:user:*`);
      const members: Array<{
        userId: string;
        nickname?: string;
        isHost: boolean;
        joined: number;
      }> = [];

      for (const key of memberKeys) {
        const data = await redis.get(key);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            const userId = key.replace(`room:${roomCode}:user:`, '');
            const hostSid = await redis.get(`room:${roomCode}:host`);
            members.push({
              userId,
              nickname: parsed.nickname,
              isHost: hostSid === userId,
              joined: parsed.joined,
            });
          } catch {
            // ignore malformed entries
          }
        }
      }

      const lastStatus = await redis.get(`room:${roomCode}:status`);
      peer.send(
        JSON.stringify({
          type: 'presence:snapshot',
          payload: {
            members,
            status: lastStatus ? JSON.parse(lastStatus) : null,
          },
        }),
      );
    }

    // Broadcast user joined to others
    peer.publish(
      `room:${roomCode}`,
      JSON.stringify({
        type: 'user:joined',
        payload: {
          userId: sid,
          isHost: !getRedis() ? true : undefined,
          joined: Date.now(),
        },
      }),
    );
  },

  async message(peer, msg) {
    const ctx = await getPeerContext(peer);
    if (!ctx) return;
    const { roomCode, payload } = ctx;
    const sid = payload.sid as string;

    let data: { type: string; payload?: unknown };
    try {
      data = msg.json<typeof data>();
    } catch {
      return;
    }

    const redis = getRedis();

    switch (data.type) {
      case 'player:update': {
        peer.publish(`room:${roomCode}`, JSON.stringify({ ...data, from: sid }));
        if (redis) {
          await redis.setex(
            `room:${roomCode}:status`,
            ROOM_TTL,
            JSON.stringify(data.payload),
          );
        }
        break;
      }

      case 'ping': {
        peer.send(JSON.stringify({ type: 'pong' }));
        break;
      }

      case 'chat:message': {
        const pl = data.payload as { text?: string; clientMsgId?: string };
        const text = sanitizeChatText(pl?.text);
        if (!text) return;

        const rlKey = `rl:chat:${roomCode}:${sid}`;
        const rl = await checkRateLimit(redis, rlKey, 5, 10);
        if (!rl.allowed) {
          peer.send(
            JSON.stringify({
              type: 'system:rate-limited',
              payload: { kind: 'chat', retryAfterMs: rl.retryAfterMs },
            }),
          );
          return;
        }

        const memberData = redis ? await redis.get(`room:${roomCode}:user:${sid}`) : null;
        const member = memberData ? JSON.parse(memberData) : {};

        const msgId = generateMsgId();
        peer.publish(
          `room:${roomCode}`,
          JSON.stringify({
            type: 'chat:message',
            payload: {
              msgId,
              clientMsgId: pl?.clientMsgId,
              userId: sid,
              nickname: member.nickname,
              text,
              ts: Date.now(),
            },
          }),
        );
        // Echo back to sender so pending → confirmed
        peer.send(
          JSON.stringify({
            type: 'chat:message',
            payload: {
              msgId,
              clientMsgId: pl?.clientMsgId,
              userId: sid,
              nickname: member.nickname,
              text,
              ts: Date.now(),
            },
          }),
        );
        break;
      }

      case 'reaction': {
        const pl = data.payload as { emoji?: string };
        if (!pl?.emoji || !isValidReactionEmoji(pl.emoji)) return;

        const rlKey = `rl:reaction:${roomCode}:${sid}`;
        const rl = await checkRateLimit(redis, rlKey, 8, 10);
        if (!rl.allowed) {
          peer.send(
            JSON.stringify({
              type: 'system:rate-limited',
              payload: { kind: 'reaction', retryAfterMs: rl.retryAfterMs },
            }),
          );
          return;
        }

        peer.publish(
          `room:${roomCode}`,
          JSON.stringify({
            type: 'reaction',
            payload: { userId: sid, emoji: pl.emoji, ts: Date.now() },
          }),
        );
        break;
      }

      case 'lobby:ready': {
        const pl = data.payload as { ready?: boolean };
        if (typeof pl?.ready !== 'boolean') return;

        if (redis) {
          const lobbyKey = `room:${roomCode}:lobby`;
          if (pl.ready) {
            await redis.hset(lobbyKey, sid, '1');
          } else {
            await redis.hdel(lobbyKey, sid);
          }
          await redis.expire(lobbyKey, ROOM_TTL);

          const readyMap = await redis.hgetall(lobbyKey);
          const memberKeys = await redis.keys(`room:${roomCode}:user:*`);
          const hostSid = await redis.get(`room:${roomCode}:host`);

          const members: Array<{
            userId: string;
            nickname?: string;
            isHost: boolean;
            ready: boolean;
          }> = [];

          for (const key of memberKeys) {
            const d = await redis.get(key);
            if (d) {
              const userId = key.replace(`room:${roomCode}:user:`, '');
              const parsed = JSON.parse(d);
              members.push({
                userId,
                nickname: parsed.nickname,
                isHost: userId === hostSid,
                ready: !!readyMap[userId],
              });
            }
          }

          peer.publish(
            `room:${roomCode}`,
            JSON.stringify({
              type: 'lobby:state',
              payload: { members, started: false },
            }),
          );
        }
        break;
      }

      case 'lobby:start': {
        const hostSid = redis ? await redis.get(`room:${roomCode}:host`) : null;
        if (hostSid && hostSid !== sid) return; // Only host can start

        if (redis) {
          await redis.del(`room:${roomCode}:lobby`);
        }

        peer.publish(
          `room:${roomCode}`,
          JSON.stringify({
            type: 'lobby:state',
            payload: { members: [], started: true },
          }),
        );
        // Also send to host
        peer.send(
          JSON.stringify({
            type: 'lobby:state',
            payload: { members: [], started: true },
          }),
        );
        break;
      }

      case 'presence:hello': {
        const pl = data.payload as { nickname?: string };
        if (redis) {
          const existing = await redis.get(`room:${roomCode}:user:${sid}`);
          const parsed = existing ? JSON.parse(existing) : { joined: Date.now() };
          parsed.nickname = pl?.nickname?.slice(0, 30) || undefined;
          await redis.setex(
            `room:${roomCode}:user:${sid}`,
            ROOM_TTL,
            JSON.stringify(parsed),
          );
        }
        break;
      }

      case 'host:transfer': {
        const pl = data.payload as { toUserId?: string };
        const hostSid = redis ? await redis.get(`room:${roomCode}:host`) : null;
        if (hostSid !== sid || !pl?.toUserId) return;

        if (redis) {
          await redis.setex(`room:${roomCode}:host`, ROOM_TTL, pl.toUserId);
        }

        peer.publish(
          `room:${roomCode}`,
          JSON.stringify({
            type: 'host:transfer',
            payload: { newHostId: pl.toUserId },
          }),
        );
        break;
      }

      default:
        break;
    }
  },

  async close(peer) {
    const ctx = await getPeerContext(peer);
    if (!ctx) return;
    const { roomCode, payload } = ctx;
    const sid = payload.sid as string;

    const redis = getRedis();
    if (redis) {
      await redis.del(`room:${roomCode}:user:${sid}`);

      // If the host left, try to assign a new host
      const currentHost = await redis.get(`room:${roomCode}:host`);
      if (currentHost === sid) {
        const remaining = await redis.keys(`room:${roomCode}:user:*`);
        if (remaining.length > 0) {
          const newHostKey = remaining[0];
          const newHostSid = newHostKey.replace(`room:${roomCode}:user:`, '');
          await redis.setex(`room:${roomCode}:host`, ROOM_TTL, newHostSid);
          peer.publish(
            `room:${roomCode}`,
            JSON.stringify({
              type: 'host:transfer',
              payload: { newHostId: newHostSid },
            }),
          );
        } else {
          await redis.del(`room:${roomCode}:host`);
        }
      }
    }

    peer.publish(
      `room:${roomCode}`,
      JSON.stringify({ type: 'user:left', userId: sid }),
    );
  },
});
