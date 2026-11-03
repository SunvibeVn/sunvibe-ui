// Polling of the photo list (survey-media spec 6.2 Polling, A-26): while a photo is uploading or processing, every 3 s
// for 2 minutes counted from the first pending photo (later uploads do not restart it), then every 15 s; while the
// page is visible and nothing is pending, every 60 s; a page that becomes visible or comes back from the bfcache reads
// at once; a 429 waits for its Retry-After. One read at a time.

export const POLL_FAST_MS = 3_000;
export const POLL_SLOW_MS = 15_000;
export const POLL_IDLE_MS = 60_000;
export const POLL_WINDOW_MS = 120_000;
/** The wait after a 429 without a usable Retry-After. */
const DEFAULT_RETRY_AFTER_MS = POLL_SLOW_MS;

export type PollResult = { kind: "applied" | "unchanged" | "failed" } | { kind: "rate-limited"; retryAfterSeconds?: number };

export type MediaPollerDeps = {
  /** One list read; the caller applies its answer (a 429 keeps the list on screen). */
  read(): Promise<PollResult>;
  /** Whether any photo is uploading or processing (local uploads included). */
  isPending(): boolean;
  isVisible(): boolean;
  now(): number;
};

export function createMediaPoller(deps: MediaPollerDeps) {
  let running = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** When the armed timer fires (0 when none is armed). */
  let dueAt = 0;
  /** When the current run of pending photos started; null while nothing is pending. */
  let windowStart: number | null = null;
  /** No read before this time (a 429's Retry-After). */
  let blockedUntil = 0;

  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
    dueAt = 0;
  };

  /** The wait before the next poll, or null for none (hidden and idle). */
  function delay(now: number): number | null {
    if (deps.isPending()) {
      windowStart ??= now;
      return now - windowStart < POLL_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS;
    }
    windowStart = null;
    return deps.isVisible() ? POLL_IDLE_MS : null;
  }

  /**
   * Arms the next poll. `keepEarlier`: an armed poll that is due no later than the new one stays (upload progress and
   * answers call `refresh` many times a second; they must never postpone the poll).
   */
  function schedule(keepEarlier = false): void {
    if (!running || inFlight) {
      clear();
      return;
    }
    const now = deps.now();
    const wait = delay(now);
    if (wait === null) {
      clear();
      return;
    }
    const at = now + Math.max(wait, blockedUntil - now);
    if (keepEarlier && timer !== undefined && dueAt <= at) return;
    clear();
    dueAt = at;
    timer = setTimeout(tick, at - now);
  }

  async function tick(): Promise<void> {
    clear();
    if (!running || inFlight) return;
    inFlight = true;
    let result: PollResult;
    try {
      result = await deps.read();
    } catch {
      result = { kind: "failed" };
    }
    inFlight = false;
    if (result.kind === "rate-limited") {
      const seconds = result.retryAfterSeconds;
      blockedUntil = deps.now() + (seconds !== undefined && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS);
    }
    schedule();
  }

  /** A read now unless one runs or a 429 asked to wait; then the schedule decides. */
  function readNow(): void {
    if (!running || inFlight) return;
    if (deps.now() < blockedUntil) {
      schedule();
      return;
    }
    void tick();
  }

  return {
    /** Starts the schedule (the caller makes the first read with `readNow`). */
    start(): void {
      running = true;
      schedule();
    },
    stop(): void {
      running = false;
      clear();
    },
    /** The pending state may have changed (an upload started or a list arrived): reschedule, window kept. */
    refresh(): void {
      schedule(true);
    },
    readNow,
    onVisibilityChange(): void {
      if (deps.isVisible()) readNow();
      else schedule();
    },
    /** `pageshow`: a page restored from the bfcache reads at once. */
    onPageShow(persisted: boolean): void {
      if (persisted) readNow();
    },
  };
}

export type MediaPoller = ReturnType<typeof createMediaPoller>;
