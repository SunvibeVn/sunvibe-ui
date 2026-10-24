"use client";

import { createContext, useContext } from "react";
import type { SurveyBlock, SurveyCommandResult, SurveyUiError } from "@/features/surveys";

import type { CommandSource } from "../lib/command-lock";
import type { Viewer } from "../lib/viewer";
import type { LeadDetail, LeadNoteResult, LeadSummary } from "../types";

export type { CommandSource } from "../lib/command-lock";

/** The survey block of the lead as the page holds it (spec 6.1). */
export type SurveyState =
  | { state: "loading" }
  | { state: "ready"; block: NonNullable<SurveyBlock> }
  | { state: "error"; error: SurveyUiError };

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
  /** The survey block, read with the detail (one GET each, in parallel). */
  survey: SurveyState;
  /** Reads the survey block again (its retry). */
  reloadSurvey(): Promise<void>;
  /**
   * Applies a survey command answer (A-23): the survey block is replaced, the lead takes its status and version, the
   * History row is appended. No reload.
   */
  applySurveyResult(result: SurveyCommandResult): void;
  /**
   * Loads the detail and the survey block again (C-36, A-23: after an assign, a status or requirement change, or a
   * refused survey command). Resolves to true when the detail answer was applied;
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
  /**
   * True while a command (assign, status change, note, survey command or requirement change) is on its way: the
   * others are locked meanwhile (CR-2, Review Focus 5).
   */
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
