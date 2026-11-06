"use client";

import { createContext, useContext } from "react";
import type { LeadDetail } from "@/features/lead-shared";
import type { ChecklistStarted, SurveyBlock, SurveyCommandResult, SurveyUiError } from "@/features/surveys";
import type { Viewer } from "@/features/workspace";

/** The survey block of the lead as the page holds it (spec 6.1). */
export type SurveyState =
  | { state: "loading" }
  | { state: "ready"; block: NonNullable<SurveyBlock> }
  | { state: "error"; error: SurveyUiError };

/** The parts of the Survey section that send a command; they take the one lock of the lead page (CR-2). */
export type SurveyCommandSource = "survey" | "checklist" | "revision";

/**
 * What the lead page offers the Survey section inside it. Only exists while a lead of the signed-in user is loaded. The
 * lead page provides it, so this feature never reads the lead's own context.
 */
export type SurveyPanelController = {
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
   * Applies a checklist start (survey-checklist spec 6.1): the History row is appended, the lead row is untouched. No
   * reload; the page then opens the checklist.
   */
  applyChecklistStarted(result: ChecklistStarted): void;
  /**
   * Loads the detail and the survey block again (C-36, A-23: after an assign, a status or requirement change, or a
   * refused survey command). Resolves to true when the detail answer was applied;
   * false for a failure (the page shows it and keeps the old data), an answer made stale by a newer call, a user
   * change or a hidden page. A 404 or 403 leaves for the list by itself.
   */
  reload(): Promise<boolean>;
  /**
   * True while a command (assign, status change, note, survey command or requirement change) is on its way: the
   * others are locked meanwhile (CR-2, Review Focus 5).
   */
  busy: boolean;
  /** Reports whether `source` has a command on its way. */
  setBusy(source: SurveyCommandSource, busy: boolean): void;
  /** Back to the list with the "not found or no longer allowed" notice (C-37); keeps no lead id in the URL. */
  leaveToList(): void;
};

const SurveyPanelContext = createContext<SurveyPanelController | null>(null);

export const SurveyPanelProvider = SurveyPanelContext.Provider;

export function useSurveyPanel(): SurveyPanelController {
  const controller = useContext(SurveyPanelContext);
  if (controller === null) throw new Error("useSurveyPanel must be used inside SurveyPanelProvider");
  return controller;
}
