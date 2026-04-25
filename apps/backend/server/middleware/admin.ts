import { useAuth } from '../utils/auth';
import { prisma } from '../utils/prisma';
export default defineEventHandler(async (event) => {
  if (!event.node.req.url?.startsWith('/admin')) return;

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '');
  if (!token) throw createError({ statusCode: 401, message: 'Unauthorized' });

  const auth = useAuth();
  const payload = await auth.verifySessionToken(token);
  if (!payload) throw createError({ statusCode: 401, message: 'Unauthorized' });

  const session = await auth.getSessionAndBump(payload.sid);
  if (!session) throw createError({ statusCode: 401, message: 'Session not found or expired' });

  // 'user' field matches the schema: sessions.user = userId
  const user = await prisma.users.findUnique({ where: { id: session.user } });
  if (!user?.permissions.includes('admin')) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }
});
