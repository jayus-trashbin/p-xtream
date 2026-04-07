import { createError } from 'h3';

const PRIVATE_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
];

const BLOCKED_HOSTS = [
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
];

const BLOCKED_KEYWORDS = ['metadata', 'internal', '169.254'];

export function validateDestination(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid destination URL' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createError({ statusCode: 400, message: 'Only HTTP/HTTPS allowed' });
  }

  const host = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.includes(host)) {
    throw createError({ statusCode: 400, message: 'Destination not allowed' });
  }

  for (const keyword of BLOCKED_KEYWORDS) {
    if (host.includes(keyword)) {
      throw createError({ statusCode: 400, message: 'Destination not allowed (blocked keyword)' });
    }
  }

  for (const range of PRIVATE_RANGES) {
    if (range.test(host)) {
      throw createError({ statusCode: 400, message: 'Private IP destinations not allowed' });
    }
  }

  return parsed;
}
