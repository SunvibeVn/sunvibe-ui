import { LIST_PATH } from "./list-url-state";

export type LastListUrl = {
  /** Remembers `href` for `userId`; anything that is not a list URL of this app is ignored. */
  set(userId: string, href: string): void;
  /** The last list URL `userId` saw in this tab, or null. */
  get(userId: string): string | null;
  /** Drops the URL not owned by `userId`; `null` drops it. */
  resetFor(userId: string | null): void;
};

const isListHref = (href: string): boolean => href === LIST_PATH || href.startsWith(`${LIST_PATH}?`);

/**
 * The list URL (tab, filters, page) the user last saw, for the detail's "Back to leads" link (CR-10). In the memory
 * of this tab only (no storage), bound to the user, dropped on sign-out and on a user change like the drafts.
 */
export function createLastListUrl(): LastListUrl {
  let current: { userId: string; href: string } | null = null;
  return {
    set(userId, href) {
      if (isListHref(href)) current = { userId, href };
    },
    get(userId) {
      return current !== null && current.userId === userId ? current.href : null;
    },
    resetFor(userId) {
      if (current !== null && current.userId !== userId) current = null;
    },
  };
}
