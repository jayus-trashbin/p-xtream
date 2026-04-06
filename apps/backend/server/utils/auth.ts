import { prisma } from './prisma';
import { signJwt, verifyJwt } from './jwt';
import { uuidv7 } from 'uuidv7';

// 21 days in ms
const SESSION_EXPIRY_MS = 21 * 24 * 60 * 60 * 1000;

export function useAuth() {
  const getSession = async (id: string) => {
    const session = await prisma.sessions.findUnique({
      where: { id },
    });

    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) return null;

    return session;
  };

  const getSessionAndBump = async (id: string) => {
    const session = await getSession(id);
    if (!session) return null;

    const now = new Date();
    const expiryDate = new Date(now.getTime() + SESSION_EXPIRY_MS);

    return await prisma.sessions.update({
      where: { id },
      data: {
        accessed_at: now,
        expires_at: expiryDate,
      },
    });
  };

  const makeSession = async (user: string, device: string, userAgent?: string) => {
    if (!userAgent) throw new Error('No useragent provided');

    const now = new Date();
    const expiryDate = new Date(now.getTime() + SESSION_EXPIRY_MS);

    // Atomic upsert — backed by @@unique([user, device]) in schema
    return await prisma.sessions.upsert({
      where: {
        user_device: { user, device },
      },
      update: {
        user_agent: userAgent,
        accessed_at: now,
        expires_at: expiryDate,
      },
      create: {
        id: uuidv7(),
        user,
        device,
        user_agent: userAgent,
        created_at: now,
        accessed_at: now,
        expires_at: expiryDate,
      },
    });
  };

  const makeSessionToken = async (session: { id: string }): Promise<string> => {
    return signJwt({ sid: session.id });
  };

  const verifySessionToken = async (token: string): Promise<{ sid: string } | null> => {
    return verifyJwt(token);
  };

  const getCurrentSession = async () => {
    const event = useEvent();
    const authHeader = getRequestHeader(event, 'authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifySessionToken(token!);
    if (!payload) {
      throw createError({
        statusCode: 401,
        message: 'Invalid token',
      });
    }

    const session = await getSessionAndBump(payload.sid);
    if (!session) {
      throw createError({
        statusCode: 401,
        message: 'Session not found or expired',
      });
    }

    return session;
  };

  return {
    getSession,
    getSessionAndBump,
    makeSession,
    makeSessionToken,
    verifySessionToken,
    getCurrentSession,
  };
}
