/** Notices the lead list can show once after a redirect (C-37). */
export type ListFlashKind = "leadNotFound";

export type ListFlash = {
  set(userId: string, kind: ListFlashKind): void;
  /** Returns the notice set for `userId` and forgets it; also forgets a notice set for someone else. */
  take(userId: string): ListFlashKind | null;
  /** Drops a notice not owned by `userId`; `null` drops it. */
  resetFor(userId: string | null): void;
};

/**
 * A one-shot note from the detail page to the list, in memory only (no URL parameter, no storage), so the redirect
 * after a 404 keeps no lead id in the address bar. Bound to the user who set it. The tab's instance is `listFlash` of
 * lib/drafts.ts, dropped with the drafts on sign-out and on a user change.
 */
export function createListFlash(): ListFlash {
  let current: { userId: string; kind: ListFlashKind } | null = null;
  return {
    set(userId, kind) {
      current = { userId, kind };
    },
    take(userId) {
      const flash = current;
      current = null;
      return flash !== null && flash.userId === userId ? flash.kind : null;
    },
    resetFor(userId) {
      if (current !== null && current.userId !== userId) current = null;
    },
  };
}
