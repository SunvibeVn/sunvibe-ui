import { isLeadStatus, type LeadStatus } from "../types";

import type { CommandMessage } from "./command-flow";
import type { NoteOutcome } from "./note-flow";
import { NOTE_MAX } from "./note-length";
import { type OriginalChoice, REASON_MAX, type StatusForm } from "./status-flow";
import { allowedTargets, isClosing } from "./transitions";

/** The STATUS choice of a new history entry that keeps the current status: Save then adds a note. */
export const KEEP_STATUS = "KEEP";

/** The STATUS choice of a new history entry (owner 2026-10-23, D-4). */
export type EntryTarget = typeof KEEP_STATUS | LeadStatus;

/** The choices of the STATUS select: keep the status, then the allowed targets (BR-3); none on a closed lead. */
export function entryTargets(status: string | undefined): EntryTarget[] {
  if (!isLeadStatus(status)) return [];
  const targets = allowedTargets(status);
  return targets.length === 0 ? [] : [KEEP_STATUS, ...targets];
}

/** Longest ACTIVITY text for `target`: a note (1..2000) unless the entry closes the lead, then a reason (1..500). */
export function entryMax(target: EntryTarget): number {
  return target !== KEEP_STATUS && isClosing(target) ? REASON_MAX : NOTE_MAX;
}

/**
 * The status change of an entry whose STATUS changes. ACTIVITY is the optional note of an open target and the
 * required reason of a closing one. The UI sets no next action any more (owner 2026-10-23, D-5).
 */
export function entryStatusForm(target: LeadStatus, activity: string, original: OriginalChoice): StatusForm {
  const closing = isClosing(target);
  return {
    target,
    reason: closing ? activity : "",
    note: closing ? "" : activity,
    nextAction: "",
    original,
  };
}

/**
 * The message under the entry for a note that did not go through. None where the entry shows the problem at ACTIVITY
 * (a check here, a 400 naming the note), the lead closed (the history keeps the text to copy), or the page leaves for
 * the list (404).
 */
export function noteMessage(outcome: NoteOutcome): CommandMessage | null {
  const support = "correlationId" in outcome && outcome.correlationId !== undefined
    ? { correlationId: outcome.correlationId }
    : {};
  switch (outcome.kind) {
    case "stale":
    case "forbidden":
    case "failed":
      return { kind: outcome.kind, ...support };
    case "rejected":
      return outcome.note || outcome.nextAction ? null : { kind: "bad-request", ...support };
    default:
      return null;
  }
}

/** The `entryStatus` draft for a STATUS choice: none for keeping the status, so that choice alone keeps no draft. */
export function entryStatusDraft(target: string): string {
  return target === KEEP_STATUS ? "" : target;
}

/**
 * True when the drafts of a lead hold an unsaved entry, so its row opens again (W11-43): typed ACTIVITY or a chosen
 * status. A typed original counts only through its DUPLICATE status; alone it is a leftover.
 */
export function entryDraftOpen(drafts: { activity: string; status: string }): boolean {
  return drafts.activity !== "" || drafts.status !== "";
}
