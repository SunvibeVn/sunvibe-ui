"use client";

import { createContext, useContext } from "react";

import type { Viewer } from "../lib/viewer";
import type { LeadDetail, LeadNoteResult, LeadSummary } from "../types";

/** The parts of the detail page that send a command: the assign dialog and the new history entry. */
export type CommandSource = "assign" | "entry";

/**
 * What the detail page offers to the parts inside it (the history entry and the assign dialog). Only exists while a
 * lead of the signed-in user is loaded.
 */
export type LeadDetailController = {
  /** Signed-in user the lead was loaded for; the key of the drafts. */
  userId: string;
  leadId: string;
  /** The lead as last loaded or updated. */
  lead: LeadDetail;
  /** `lead.version`: send it as `expectedVersion` with an assign or status change. Taken from every 2xx. */
  version: number | undefined;
  viewer: Viewer;
  /**
   * Loads the detail again (C-36: after an assign or status change). Resolves to true when the answer was applied;
   * false for a failure (the page shows it and keeps the old data), an answer made stale by a newer call, a user
   * change or a hidden page. A 404 or 403 leaves for the list by itself.
   */
  reload(): Promise<boolean>;
  /** Applies the 201 of a note: appends `activity`, takes the lead fields, no reload. */
  applyNoteResult(result: LeadNoteResult): void;
  /**
   * Applies the summary a 2xx assign or status change returned, so `version` is current even when the reload that
   * follows fails (spec 5.2). Call it before `reload()`.
   */
  applyCommandResult(summary: LeadSummary): void;
  /** True while a command (assign, status change or note) is on its way: the others are locked meanwhile (CR-2). */
  busy: boolean;
  /** Reports whether `source` has a command on its way. */
  setBusy(source: CommandSource, busy: boolean): void;
  /** Back to the list with the "not found or no longer allowed" notice (C-37); keeps no lead id in the URL. */
  leaveToList(): void;
};

const LeadDetailContext = createContext<LeadDetailController | null>(null);

export const LeadDetailProvider = LeadDetailContext.Provider;

export function useLeadDetail(): LeadDetailController {
  const controller = useContext(LeadDetailContext);
  if (controller === null) throw new Error("useLeadDetail must be used inside LeadDetailView");
  return controller;
}
