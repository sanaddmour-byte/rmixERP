/**
 * Bounded exponential backoff for clearance transport-failure retries
 * (CLAUDE.md/PLAN.md: "Bounded exponential-backoff retry via cron for
 * transport failures only"). A pure function so the schedule is unit
 * tested without touching the cron job or the database.
 */

/** After this many attempts, `computeRetryDelayMs` returns `null` — the cron stops auto-retrying and the document needs a manual retry from the clearance queue. */
export const MAX_CLEARANCE_ATTEMPTS = 8;

const BASE_DELAY_MS = 30_000; // 30s
const MAX_DELAY_MS = 30 * 60_000; // 30min cap

/**
 * `attemptNumber` is the attempt that just failed (1-indexed: the first
 * failure is attempt 1). Returns the delay before the *next* attempt, or
 * `null` once `MAX_CLEARANCE_ATTEMPTS` is reached.
 */
export function computeRetryDelayMs(attemptNumber: number): number | null {
  if (attemptNumber >= MAX_CLEARANCE_ATTEMPTS) return null;
  const delay = BASE_DELAY_MS * 2 ** (attemptNumber - 1);
  return Math.min(delay, MAX_DELAY_MS);
}
