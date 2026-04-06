import { SignJWT, jwtVerify } from 'jose';

const getSecret = () => {
  const secret = process.env.CRYPTO_SECRET;
  if (!secret) throw new Error('[P-Stream] CRYPTO_SECRET is not set');
  return new TextEncoder().encode(secret);
};

const ALG = 'HS256';

export interface JwtPayload {
  /** Session ID (matches `sessions.id` in DB) */
  sid: string;
}

/**
 * Signs a new JWT with the provided payload.
 * Session expires in 21 days.
 */
export async function signJwt(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('21d')
    .sign(getSecret());
}

/**
 * Verifies a JWT and returns its payload.
 * Returns null if the token is invalid or expired.
 */
export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}
