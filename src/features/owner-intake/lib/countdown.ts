/** A wait that started at `startedAt` (epoch ms) and lasts `seconds` (429 Retry-After). */
export type Countdown = { startedAt: number; seconds: number };

/** Whole seconds left at `now`, rounded up; 0 once the wait is over. A clock set back never adds time. */
export function secondsLeft({ startedAt, seconds }: Countdown, now: number): number {
  const elapsed = Math.max(0, now - startedAt);
  return Math.max(0, Math.ceil((seconds * 1000 - elapsed) / 1000));
}
