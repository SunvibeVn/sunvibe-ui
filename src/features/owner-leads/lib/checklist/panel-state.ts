import type { ChecklistGroupPath, ChecklistUiError } from "@/features/surveys";

import type { ChecklistProblems } from "../../schemas/checklist";

// The save status of one group panel (survey-checklist spec 6.2): idle (saved or with unsaved changes, read from the
// draft), "Saving…", "Not saved: <reason>", or the correction box open. A second Save while one runs is ignored
// (Review Focus 3).

/** Why a save did not happen; each has its text in `checklist.panel`. */
export type NotSavedReason = "invalid" | "server" | "failed" | "network" | "forbidden" | "ineligible" | "stale";

export type PanelState = {
  status: "idle" | "saving" | "failed" | "correction";
  reason: NotSavedReason | null;
  /** Problems by JSON path: the page's checks, or the server's 400 fields. */
  problems: ChecklistProblems;
  /** The correction box was opened by the server's 400 on `correction` (an entry put back, A-29). */
  serverCorrection: boolean;
  /** `stale`: the other group whose version was stale, null for this group (spec 6.3). */
  staleGroup?: ChecklistGroupPath | null;
};

export const idle = (): PanelState => ({ status: "idle", reason: null, problems: {}, serverCorrection: false });

/** Starts a save; not accepted while one runs (a double click sends one PUT). */
export function startSave(state: PanelState): { state: PanelState; accepted: boolean } {
  if (state.status === "saving") return { state, accepted: false };
  return { state: { ...state, status: "saving", reason: null }, accepted: true };
}

export type PanelEvent =
  | { type: "saved" }
  | { type: "failed"; reason: NotSavedReason; staleGroup?: ChecklistGroupPath | null }
  | { type: "invalid"; problems: ChecklistProblems; reason?: NotSavedReason }
  | { type: "correction"; server: boolean }
  | { type: "cancel" };

export function panelEvent(state: PanelState, event: PanelEvent): PanelState {
  switch (event.type) {
    case "saved":
    case "cancel":
      return idle();
    case "failed":
      return event.staleGroup === undefined
        ? { ...state, status: "failed", reason: event.reason }
        : { ...state, status: "failed", reason: event.reason, staleGroup: event.staleGroup };
    case "invalid":
      return { ...state, status: "failed", reason: event.reason ?? "invalid", problems: event.problems };
    case "correction":
      return { ...state, status: "correction", reason: null, serverCorrection: event.server };
  }
}

/**
 * What a refused save does to its panel (spec 6.3): a 400 naming `correction` opens the correction box with the edits
 * kept (BR-22, A-29); other 400 paths go to their fields; a 409 on a version names the group that changed, and the
 * compare view follows once the page has read again; the page answers 404, 403, read-only and the session itself.
 */
export function saveFailureEvent(error: ChecklistUiError): PanelEvent {
  switch (error.kind) {
    case "correction-required":
      return { type: "correction", server: true };
    case "validation": {
      const problems: ChecklistProblems = {};
      for (const path of Object.keys(error.fieldErrors ?? {})) problems[path] = "server";
      return { type: "invalid", problems, reason: "server" };
    }
    case "form":
      return { type: "failed", reason: "server" };
    case "retry":
      return { type: "failed", reason: "network" };
    case "surveyor-ineligible":
      return { type: "failed", reason: "ineligible" };
    case "forbidden":
      return { type: "failed", reason: "forbidden" };
    case "stale":
      return { type: "failed", reason: "stale", staleGroup: error.staleGroup ?? null };
    case "not-allowed":
    case "already-started":
      return { type: "failed", reason: "failed" };
    default:
      return { type: "cancel" };
  }
}
