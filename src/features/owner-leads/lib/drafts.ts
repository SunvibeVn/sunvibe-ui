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
 * `survey*` and `requirement`: the survey dialogs and the requirement change; each keeps all its fields as one JSON
 * text (`writeFormDraft`), the change dialog with the appointment version it was typed for.
 * `checklistIntake`: the intake declaration of a checklist start by someone other than the performer.
 * `checklist:<checklistId>:<group>`: the edits of one checklist group (`checklist/checklist-draft.ts`).
 */
export type DraftForm =
  | "activity"
  | "entryStatus"
  | "duplicate"
  | "assignNote"
  | "surveyBook"
  | "surveyChange"
  | "surveyConfirm"
  | "surveyCancel"
  | "surveyVisit"
  | "surveyResume"
  | "requirement"
  | "checklistIntake"
  | `checklist:${string}`;

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
  /** Drops every draft whose key matches (a lead's checklist drafts after a 404). */
  clearMatching(match: (key: DraftKey) => boolean): void;
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

    clearMatching(match) {
      let changed = false;
      for (const id of [...drafts.keys()]) {
        const [userId, leadId, form] = JSON.parse(id) as [string, string, DraftForm];
        if (match({ userId, leadId, form })) {
          drafts.delete(id);
          changed = true;
        }
      }
      if (changed) notify();
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

type FormValue = string | number | boolean | null | { [key: string]: FormValue };
export type FormFields = { [key: string]: FormValue };

/** True when `value` may stand in for `fallback`: the same type, or a number where the default is null and back. */
function fits(value: unknown, fallback: FormValue): boolean {
  const nullableNumber = (item: unknown) => item === null || typeof item === "number";
  if (nullableNumber(fallback) && nullableNumber(value)) return true;
  if (fallback === null || typeof fallback !== "object") return typeof value === typeof fallback;
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `defaults` with every field of `stored` that has the right type (nested objects field by field). */
function mergeFields<T extends FormFields>(defaults: T, stored: Record<string, unknown>): T {
  const result: FormFields = { ...defaults };
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = stored[key];
    if (!Object.hasOwn(stored, key) || !fits(value, fallback)) continue;
    result[key] =
      fallback !== null && typeof fallback === "object"
        ? mergeFields(fallback, value as Record<string, unknown>)
        : (value as FormValue);
  }
  return result as T;
}

/**
 * What a draft was typed for: the appointment id (and version) a survey dialog edits. A draft read with another tag
 * is dropped, so a draft never lands on another appointment or on a newer version of it.
 */
export type DraftTag = string | number;

/**
 * The draft text of a multi-field form: as JSON, only the fields that differ from `defaults`, with the tag of what it
 * edits when given; "" (no draft) when nothing differs. Read over newer defaults (a reload after a conflict), the
 * fields the user did not touch take the newer values, so a resubmit never puts back what someone else changed.
 */
export function writeFormDraft<T extends FormFields>(fields: T, defaults: T, version?: DraftTag): string {
  const changed = Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(defaults[key])),
  );
  if (Object.keys(changed).length === 0) return "";
  return JSON.stringify(version === undefined ? { fields: changed } : { fields: changed, version });
}

/**
 * The fields of a draft text over `defaults`: unreadable text, a field of the wrong type and unknown fields are
 * ignored; a draft typed for another `version` (an appointment changed meanwhile) gives the defaults.
 */
export function readFormDraft<T extends FormFields>(text: string, defaults: T, version?: DraftTag): T {
  if (text === "") return defaults;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return defaults;
  }
  if (typeof parsed !== "object" || parsed === null) return defaults;
  const draft = parsed as { fields?: unknown; version?: unknown };
  if (version !== undefined && draft.version !== version) return defaults;
  if (typeof draft.fields !== "object" || draft.fields === null) return defaults;
  return mergeFields(defaults, draft.fields as Record<string, unknown>);
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
/** The drafts of this tab, for the checklist page that reads and rebases several group drafts at once. */
export const tabDrafts: DraftStore = draftStore;
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

/**
 * The draft of a multi-field form (the survey dialogs, the requirement change): `[fields, setFields, clear]`, kept as
 * one JSON text in the tab's drafts. `version` ties the draft to what it edits: a draft of another tag is dropped.
 * Pass the tag of the opening (not a value that changes while the dialog is open), so a reload after a conflict keeps
 * the typed text (spec 6.7). `clear(submitted)` clears only the draft of the fields that were sent.
 */
export function useFormDraft<T extends FormFields>(
  key: DraftKey,
  defaults: T,
  version?: DraftTag,
): [T, (next: T) => void, (submitted?: T) => void] {
  const [text, setText, clearText] = useDraft(key);
  const fields = readFormDraft(text, defaults, version);
  const setFields = (next: T) => setText(writeFormDraft(next, defaults, version));
  const clear = (submitted?: T) =>
    clearText(submitted === undefined ? undefined : writeFormDraft(submitted, defaults, version));
  return [fields, setFields, clear];
}
