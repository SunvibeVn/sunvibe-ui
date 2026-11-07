"use client";

import { createContext, useContext } from "react";
import type { LeadSummary } from "@/features/lead-shared";
import type { SurveyPanelController, SurveyState } from "@/features/surveys/client";

import type { CommandSource } from "../lib/command-lock";
import type { SurveyRecordFacts } from "../lib/transitions";
import type { LeadNoteResult } from "../types";

export type { CommandSource } from "../lib/command-lock";

/**
 * What the detail page offers to the parts inside it (the history entry and the assign dialog): what the Survey section
 * gets, and the lead's own commands. Only exists while a lead of the signed-in user is loaded.
 */
export type LeadDetailController = Omit<SurveyPanelController, "setBusy"> & {
  /** Applies the 201 of a note: appends `activity`, takes the lead fields, no reload. */
  applyNoteResult(result: LeadNoteResult): void;
  /**
   * Applies the summary a 2xx assign or status change returned, so `version` is current even when the reload that
   * follows fails (spec 5.2). Call it before `reload()`.
   */
  applyCommandResult(summary: LeadSummary): void;
  /** Reports whether `source` has a command on its way. */
  setBusy(source: CommandSource, busy: boolean): void;
};

/** The survey record of the loaded block; none while the block is loading or failed, so nothing is hidden on a guess. */
export function surveyRecordOf(survey: SurveyState): SurveyRecordFacts | null {
  return survey.state === "ready" ? (survey.block.survey ?? null) : null;
}

const LeadDetailContext = createContext<LeadDetailController | null>(null);

export const LeadDetailProvider = LeadDetailContext.Provider;

export function useLeadDetail(): LeadDetailController {
  const controller = useContext(LeadDetailContext);
  if (controller === null) throw new Error("useLeadDetail must be used inside LeadDetailView");
  return controller;
}
