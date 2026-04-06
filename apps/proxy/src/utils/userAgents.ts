/**
 * User-Agent rotation utility.
 *
 * Cycles through a pool of real browser UAs in round-robin order.
 * This reduces the likelihood of CDN/origin fingerprinting-based blocks.
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

let rrIndex = 0;

/**
 * Returns the next User-Agent string in a round-robin sequence.
 * Thread-safe for single-threaded Node.js / Nitro environments.
 */
export function getNextUserAgent(): string {
  const ua = USER_AGENTS[rrIndex % USER_AGENTS.length]!;
  rrIndex = (rrIndex + 1) % USER_AGENTS.length;
  return ua;
}
