import { z } from 'zod';
import { useChallenge } from '~/utils/challenge';
import { checkRateLimit } from '~/utils/rateLimit';

const startSchema = z.object({
  publicKey: z.string(),
});

export default defineEventHandler(async event => {
  // Rate limit: 5 login attempts per IP per 60 seconds
  const ip = getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    ?? event.node.req.socket?.remoteAddress
    ?? 'unknown';
  checkRateLimit(`login:${ip}`, 5, 60_000);

  const body = await readBody(event);

  const result = startSchema.safeParse(body);
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body',
    });
  }

  const user = await prisma.users.findUnique({
    where: { public_key: body.publicKey },
    select: { id: true },
  });

  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'User cannot be found',
    });
  }

  const challenge = useChallenge();
  const challengeCode = await challenge.createChallengeCode('login', 'mnemonic');

  return {
    challenge: challengeCode.code,
  };
});
