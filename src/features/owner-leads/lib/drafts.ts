"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { type SessionSnapshot, type SessionUser, useSession } from "@/features/auth/client";

import { createLastListUrl } from "./last-list-url";
import { createListFlash } from "./list-flash";

// Drafts of the workspace forms (spec 5.2, C-33): in the memory of this tab only, never in localStorage,
// sessionStorage or IndexedDB. Restored when a form mounts again (after `unavailable`, Back/Forward, a reload of the
// detail), cleared by the form on success, and dropped on sign-out or when another user signs in.

/**
 * `activity`, `entryStatus` (the chosen STATUS) and `duplicate` (pasted link or code of the original): the new history
 * entry (owner 2026-10-23, D-4).
 * `assignNote`: the assign dialog.
 */
export type DraftForm = "activity" | "entryStatus" | "duplicate" | "assignNote";

export type DraftKey = { userId: string; leadId: string; form: DraftForm };

export type DraftStore = {
  get(key: DraftKey): string | undefined;
  /** An empty text removes the draft. */
  set(key: DraftKey, value: string): void;
  /**
   * Removes the draft. With `submitted`, only when the draft still holds that text: a submit that ends after the user
   * typed again never clears the newer text.
   */
  clear(key: DraftKey, submitted?: string): void;
  /** Drops every draft not owned by `userId`; `null` drops them all. */
  resetFor(userId: string | null): void;
  /** Called after each change that added, changed or removed a draft. */
  subscribe(listener: () => void): () => void;
};

/** Unambiguous map key: ids may contain any character. */
const idOf = ({ userId, leadId, form }: DraftKey): string => JSON.stringify([userId, leadId, form]);

export function createDraftStore(): DraftStore {
  const drafts = new Map<string, { userId: string; value: string }>();
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One failing subscriber must not keep the others from updating.
      }
    }
  };

  return {
    get: (key) => drafts.get(idOf(key))?.value,

    set(key, value) {
      const id = idOf(key);
      if (value === "") {
        if (drafts.delete(id)) notify();
        return;
      }
      if (drafts.get(id)?.value === value) return;
      drafts.set(id, { userId: key.userId, value });
      notify();
    },

    clear(key, submitted) {
      const id = idOf(key);
      if (submitted !== undefined && drafts.get(id)?.value !== submitted) return;
      if (drafts.delete(id)) notify();
    },

    resetFor(userId) {
      let changed = false;
      for (const [id, entry] of drafts) {
        if (entry.userId !== userId) {
          drafts.delete(id);
          changed = true;
        }
      }
      if (changed) notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The part of the session the drafts depend on. */
export type DraftSessionView = Pick<SessionSnapshot, "status"> & { user: Pick<SessionUser, "userId"> | null };

/**
 * Keeps a draft store in step with the session: `signed-out` drops every draft; a user id other than the last one
 * seen drops the drafts of everyone else. `restoring` and `unavailable` never drop anything (C-33, E-8), whether
 * they still carry the user or not. Idempotent: observing the same session again changes nothing.
 */
export function createDraftSessionGuard(store: Pick<DraftStore, "resetFor">) {
  let lastUserId: string | null = null;
  return {
    observe(session: DraftSessionView): void {
      if (session.status === "signed-out") {
        lastUserId = null;
        store.resetFor(null);
        return;
      }
      const userId = session.user?.userId;
      if (!userId || userId === lastUserId) return;
      lastUserId = userId;
      store.resetFor(userId);
    },
  };
}

/**
 * Everything the workspace keeps in the memory of this tab for one user: the drafts, the list's one-shot notice
 * (C-37) and the last list URL (the detail's back link). One guard drops all three on sign-out and on a user change.
 */
export function createTabMemory() {
  const drafts = createDraftStore();
  const listFlash = createListFlash();
  const lastListUrl = createLastListUrl();
  const guard = createDraftSessionGuard({
    resetFor(userId) {
      drafts.resetFor(userId);
      listFlash.resetFor(userId);
      lastListUrl.resetFor(userId);
    },
  });
  return { drafts, listFlash, lastListUrl, guard };
}

const tabMemory = createTabMemory();
const draftStore = tabMemory.drafts;
const sessionGuard = tabMemory.guard;
/** The list's one-shot notice of this tab (C-37). */
export const listFlash = tabMemory.listFlash;
/** The last list URL of this tab, per user (CR-10). */
export const lastListUrl = tabMemory.lastListUrl;

/**
 * Feeds the session into the tab's memory (drafts, list notice, last list URL). `DraftSessionSync` mounts it once at
 * the app layer (SEC-M2), so everything is dropped on a sign-out anywhere in the app, also with no form on screen;
 * `useDraft` calls it too.
 */
export function useDraftSessionSync(): void {
  const session = useSession();
  const status = session.status;
  const userId = session.user?.userId ?? null;
  useEffect(() => {
    sessionGuard.observe({ status, user: userId === null ? null : { userId } });
  }, [status, userId]);
}

const noDraftOnServer = (): string => "";

/**
 * The draft of one form: `[text, setText, clear]`, shared by every mount with the same key and kept after unmount.
 * Pass the signed-in user's id in `key`; after a successful submit, `clear(submittedText)` (only that text is cleared).
 */
export function useDraft(key: DraftKey): [string, (value: string) => void, (submitted?: string) => void] {
  useDraftSessionSync();
  const { userId, leadId, form } = key;

  const getSnapshot = useCallback(() => draftStore.get({ userId, leadId, form }) ?? "", [userId, leadId, form]);
  const value = useSyncExternalStore(draftStore.subscribe, getSnapshot, noDraftOnServer);

  const setValue = useCallback(
    (next: string) => draftStore.set({ userId, leadId, form }, next),
    [userId, leadId, form],
  );
  const clear = useCallback(
    (submitted?: string) => draftStore.clear({ userId, leadId, form }, submitted),
    [userId, leadId, form],
  );

  return [value, setValue, clear];
}
