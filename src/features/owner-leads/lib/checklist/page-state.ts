import { CHECKLIST_GROUP_PATHS, type ChecklistGroupPath, type ChecklistUiError, type ChecklistView } from "@/features/surveys";

import type { DraftStore } from "../drafts";
import type { OwnerLeadsKey } from "../labels";

import { applyAnswer } from "./answer-merge";
import { type ChecklistDraftKey, dropChecklistDrafts } from "./checklist-draft";

// Page-level rules of the checklist page (survey-checklist spec 6.2, 6.3): read-only notices, panel locks and what a
// failed load or command does to the page.

export type ReadOnlyNotice = { kind: "takeover" } | { kind: "reason"; key: OwnerLeadsKey };

/** Null for an editor; the takeover prompt for the assignee who is not the holder; else the reason of 6.4. */
export function readOnlyNotice(view: ChecklistView): ReadOnlyNotice | null {
  if (view.editable === true) return null;
  const reason = view.readOnlyReason ?? "NOT_ASSIGNEE";
  if (reason === "TAKEOVER_REQUIRED") return { kind: "takeover" };
  return { kind: "reason", key: `checklist.readOnly.${reason}` };
}

/** Which panels wait for an answer: every panel during a takeover or a G1 save that cascades (A-12), else per group. */
export type PanelLocks = { all: boolean; groups: readonly ChecklistGroupPath[] };

export const NO_LOCKS: PanelLocks = { all: false, groups: [] };

export const lockAll = (locks: PanelLocks): PanelLocks => ({ ...locks, all: true });
export const unlockAll = (locks: PanelLocks): PanelLocks => ({ ...locks, all: false });
export const lockGroup = (locks: PanelLocks, group: ChecklistGroupPath): PanelLocks =>
  locks.groups.includes(group) ? locks : { ...locks, groups: [...locks.groups, group] };
export const unlockGroup = (locks: PanelLocks, group: ChecklistGroupPath): PanelLocks =>
  locks.groups.includes(group) ? { ...locks, groups: locks.groups.filter((item) => item !== group) } : locks;
export const isPanelLocked = (locks: PanelLocks, group: ChecklistGroupPath): boolean =>
  locks.all || locks.groups.includes(group);

/** After a 404 the checklist is gone or hidden: its drafts are dropped with its data (W16-32). */
export function forgetChecklist(store: Pick<DraftStore, "clear">, key: Omit<ChecklistDraftKey, "group">): void {
  dropChecklistDrafts(store, key);
}

/** Drops the intake draft and every checklist draft of a lead (a 404 on a checklist start, spec 6.2). */
export function forgetLeadChecklists(store: Pick<DraftStore, "clearMatching">, key: { userId: string; leadId: string }): void {
  store.clearMatching(
    (draft) =>
      draft.userId === key.userId &&
      draft.leadId === key.leadId &&
      (draft.form === "checklistIntake" || draft.form.startsWith("checklist:")),
  );
}

/**
 * Whether answers may reach the screen: closed while Next keeps the route hidden (Activity), so a save or takeover
 * answering after the user left never puts the checklist back into the hidden route (W16-32).
 */
export function createAnswerGate() {
  let shown = true;
  return {
    open: (): boolean => shown,
    hide(): void {
      shown = false;
    },
    show(): void {
      shown = true;
    },
  };
}

/** What a failed snapshot read does: a 404 leaves like any 404 (W16-32); the session screens answer 401. */
export function checkpointFailure(error: ChecklistUiError): "leave" | "session" | "inline" {
  if (error.kind === "not-found") return "leave";
  if (error.kind === "signed-out" || error.kind === "unavailable") return "session";
  return "inline";
}

/** A message key of `OwnerLeads.checklist.errors`. */
export type PageMessage = "forbidden" | "readOnlyNow" | "takeoverRequired";

export type PageFailureStep =
  /** 404: drafts and data dropped, back to the lead list with "Lead not found, or you can no longer see it.". */
  | { kind: "leave" }
  /** 401 or unavailable: the session screens answer; drafts stay. */
  | { kind: "session" }
  /** 403, read-only, takeover required: read again (read-only or the takeover prompt) with a message. */
  | { kind: "reload"; message: PageMessage }
  /** Anything else is the panel's own message (fields, correction, compare, retry). */
  | { kind: "panel" };

export function pageFailureStep(error: ChecklistUiError): PageFailureStep {
  switch (error.kind) {
    case "not-found":
      return { kind: "leave" };
    case "signed-out":
    case "unavailable":
      return { kind: "session" };
    case "forbidden":
      return { kind: "reload", message: "forbidden" };
    case "read-only":
      return { kind: "reload", message: "readOnlyNow" };
    case "takeover-required":
      return { kind: "reload", message: "takeoverRequired" };
    default:
      return { kind: "panel" };
  }
}

/** What the page shows: the view on screen and whether a 403 locked editing (spec 6.3). */
export type PageView = { view: ChecklistView | null; locked: boolean };

export type ViewEvent =
  | { type: "read"; view: ChecklistView }
  | { type: "readFailed" }
  | { type: "forbidden" }
  | { type: "answer"; view: ChecklistView };

/** The versions a read is ordered by: the checklist row, each saved group and the media set (SV-004, spec 6.1). */
function versionsOf(view: ChecklistView): number[] {
  return [
    view.version ?? 0,
    ...CHECKLIST_GROUP_PATHS.map((group) => view.groups?.[group]?.version ?? -1),
    view.media?.setVersion ?? 0,
  ];
}

/** How far a revision came: DRAFT, SUBMITTED, then decided; nothing goes back (survey-checklist submission 4.1). */
function stageOf(view: ChecklistView): number {
  if (view.status === undefined || view.status === "DRAFT") return 0;
  return view.status === "SUBMITTED" ? 1 : 2;
}

/**
 * How a read compares with the screen: a newer status wins and an earlier one is "older", whatever the versions say
 * (a revision never goes back, survey-checklist submission 4.1); within one status "older" when some version is lower
 * and none higher (a read sent before a save or takeover answered), "mixed" when some are lower and others higher (the
 * page reads again), else "current".
 */
export function readOrder(screen: ChecklistView, read: ChecklistView): "current" | "older" | "mixed" {
  const stage = stageOf(read) - stageOf(screen);
  if (stage !== 0) return stage > 0 ? "current" : "older";
  const shown = versionsOf(screen);
  const incoming = versionsOf(read);
  const lower = incoming.some((value, index) => value < shown[index]);
  if (!lower) return "current";
  return incoming.some((value, index) => value > shown[index]) ? "mixed" : "older";
}

/** After a 403 nothing stays live on a stale hint: no input to edit, no review to send (survey-checklist submission 6.3). */
function lockView(view: ChecklistView | null): ChecklistView | null {
  if (view === null) return view;
  const editing = view.editable === true;
  const reviewing = view.review?.canReview === true;
  if (!editing && !reviewing) return view;
  return {
    ...view,
    ...(editing ? { editable: false, readOnlyReason: view.readOnlyReason ?? "NOT_ASSIGNEE" } : {}),
    ...(reviewing ? { review: { ...view.review, canReview: false } } : {}),
  };
}

/**
 * The page's view after an event (spec 6.2, 6.3): a 403 locks editing at once and asks for a read; a save or takeover
 * answer is merged (`applyAnswer`) and stays read-only while locked, asking for a read; a failed read keeps what is on
 * screen; only a successful read unlocks, its own `editable` and reason applying. A read older than the screen (a
 * lower checklist, group or media set version, SV-004) is ignored; one that is newer in some versions and older in
 * others keeps the screen and reads again. `reload`: read the checklist again.
 */
export function viewEvent(state: PageView, event: ViewEvent): { state: PageView; reload: boolean } {
  switch (event.type) {
    case "read": {
      const order = state.view === null ? "current" : readOrder(state.view, event.view);
      // An ignored read cannot lift a 403 lock: only a read at least as new as the screen does, so read again.
      if (order === "older") return { state, reload: state.locked };
      if (order === "mixed") return { state, reload: true };
      return { state: { view: event.view, locked: false }, reload: false };
    }
    case "readFailed":
      return { state, reload: false };
    case "forbidden":
      return { state: { view: lockView(state.view), locked: true }, reload: true };
    case "answer": {
      // No view on screen: the answer was sent before the route was hidden; only a read shows the checklist again.
      if (state.view === null) return { state, reload: true };
      const merged = applyAnswer(state.view, event.view);
      if (!state.locked) return { state: { view: merged.view, locked: false }, reload: merged.needsReload };
      return { state: { view: lockView(merged.view), locked: true }, reload: true };
    }
  }
}

/** The view event of a failed read: a 403 locks editing like any 403 (spec 6.3); anything else keeps the screen. */
export function readFailureEvent(error: ChecklistUiError): ViewEvent {
  return error.kind === "forbidden" ? { type: "forbidden" } : { type: "readFailed" };
}
