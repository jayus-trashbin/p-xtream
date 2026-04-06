import { z } from 'zod';
import { useChallenge } from '~/utils/challenge';
import { checkRateLimit } from '~/utils/rateLimit';

const startSchema = z.object({
  captchaToken: z.string().optional(),
});

export default defineEventHandler(async event => {
  // Rate limit: 5 registration attempts per IP per 60 seconds
  const ip = getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    ?? event.node.req.socket?.remoteAddress
    ?? 'unknown';
  checkRateLimit(`register:${ip}`, 5, 60_000);

  const body = await readBody(event);

  const result = startSchema.safeParse(body);
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body',
    });
  }

  const challenge = useChallenge();
  const challengeCode = await challenge.createChallengeCode('registration', 'mnemonic');

  return {
    challenge: challengeCode.code,
  };
});
