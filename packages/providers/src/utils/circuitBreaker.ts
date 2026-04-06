/**
 * Circuit Breaker for provider scraping.
 *
 * States:
 *  - Closed (normal): requests pass through
 *  - Open (tripped): provider is skipped until backoff expires
 *
 * Exponential backoff: 5min → 15min → 1h (capped at 1h)
 * Resets automatically after the backoff window expires.
 */

interface CircuitState {
  failures: number;
  lastFailure: number;
  openUntil: number;
}

// Module-level singleton — survives for the lifetime of the process/tab
const state = new Map<string, CircuitState>();

const FAILURE_THRESHOLD = 3; // failures before circuit opens
const BASE_BACKOFF_MS = 5 * 60 * 1_000; // 5 minutes
const MAX_BACKOFF_MULTIPLIER = 12; // caps at BASE_BACKOFF_MS * 12 = 1 hour

/**
 * Returns true if the circuit for this provider is open (provider should be skipped).
 * Automatically resets the circuit if the backoff window has expired.
 */
export function isCircuitOpen(providerId: string): boolean {
  const s = state.get(providerId);
  if (!s) return false;
  if (s.openUntil > Date.now()) return true;

  // Backoff expired — reset to half-open (allow one attempt)
  state.delete(providerId);
  return false;
}

/**
 * Call after a successful scrape to reset the circuit.
 */
export function recordSuccess(providerId: string): void {
  state.delete(providerId);
}

/**
 * Call after a failed scrape. Opens the circuit after FAILURE_THRESHOLD failures.
 */
export function recordFailure(providerId: string): void {
  const s = state.get(providerId) ?? { failures: 0, lastFailure: 0, openUntil: 0 };
  s.failures += 1;
  s.lastFailure = Date.now();

  if (s.failures >= FAILURE_THRESHOLD) {
    const multiplier = Math.min(
      Math.pow(3, s.failures - FAILURE_THRESHOLD),
      MAX_BACKOFF_MULTIPLIER,
    );
    s.openUntil = Date.now() + BASE_BACKOFF_MS * multiplier;
    console.warn(
      `[CircuitBreaker] ${providerId}: opened for ${Math.round((BASE_BACKOFF_MS * multiplier) / 60_000)}min (failure #${s.failures})`,
    );
  }

  state.set(providerId, s);
}

/**
 * Returns a snapshot of the current circuit states (for debugging / health endpoint).
 */
export function getCircuitStatus(): Record<string, { failures: number; openUntil: number; openUntilDate: string }> {
  return Object.fromEntries(
    Array.from(state.entries()).map(([id, s]) => [
      id,
      {
        failures: s.failures,
        openUntil: s.openUntil,
        openUntilDate: new Date(s.openUntil).toISOString(),
      },
    ]),
  );
}

/**
 * Reset all circuits (useful in tests or admin endpoints).
 */
export function resetAllCircuits(): void {
  state.clear();
}
