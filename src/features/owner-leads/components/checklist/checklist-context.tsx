"use client";

import { createContext, useContext } from "react";

import type {
  ChecklistDecisionInput,
  ChecklistGroupPath,
  ChecklistSaveBody,
  ChecklistTakeoverInput,
  ChecklistUiError,
  ChecklistView,
} from "@/features/surveys";

import type { GroupContext } from "../../lib/checklist/group-input";
import type { EarlierChecklist } from "../../lib/checklist/page-notices";
import type { PageMessage, PanelLocks } from "../../lib/checklist/page-state";
import type { DecisionResult } from "../../lib/checklist/review-model";
import type { ChecklistRules } from "../../schemas/checklist";

/** What a save or a takeover gave the part that sent it; page-level outcomes (404, read-only) are handled already. */
export type CommandOutcome = { kind: "saved" } | { kind: "failed"; error: ChecklistUiError };

/** A message the page shows above the tabs. */
export type ChecklistPageMessage =
  | PageMessage
  | "takeoverStale"
  | "takeoverNotAllowed"
  | "surveyorIneligible"
  | "alreadyDecided";

/** What the checklist page offers its parts (survey-checklist spec 6.2). Exists only while a checklist is loaded. */
export type ChecklistController = {
  userId: string;
  leadId: string;
  checklistId: string;
  view: ChecklistView;
  /** The G1 spaces and scope on screen: the per-space lists and PARTS-only units of the other groups follow them. */
  ctx: GroupContext;
  /** Today and the visit's arrival date (Vietnam) and the viewer, for the page's checks. */
  rules: ChecklistRules;
  locks: PanelLocks;
  earlier: EarlierChecklist | null;
  /** Edits a G1 removal or scope switch dropped, per group ("Not kept: ..."). */
  notKept: Partial<Record<ChecklistGroupPath, string[]>>;
  clearNotKept(group: ChecklistGroupPath): void;
  message: ChecklistPageMessage | null;
  /** Saves a group; `cascade` for a G1 save that removes a space or switches the scope (every panel locks, A-12). */
  save<G extends ChecklistGroupPath>(group: G, body: ChecklistSaveBody[G], cascade: boolean): Promise<CommandOutcome>;
  takeOver(input: ChecklistTakeoverInput): Promise<CommandOutcome>;
  /** Submits the revision on screen with the version read; every panel waits (survey-checklist submission 6.1). */
  submit(): Promise<CommandOutcome>;
  /**
   * Sends a decision; every panel waits. After a refusal that may hide a committed decision the page reads first
   * (spec 9.5), so the result says what stands.
   */
  decide(input: ChecklistDecisionInput): Promise<DecisionResult>;
  /** A refusal the page answers itself (404: drafts and data dropped, back to the list); true when it did. */
  fail(error: ChecklistUiError): Promise<boolean>;
  reload(): Promise<unknown>;
  /** Grows with every 403 or 404 of a checklist call: the photos' object URLs are revoked (survey-media spec 6.2). */
  accessLost: number;
};

const ChecklistContext = createContext<ChecklistController | null>(null);

export const ChecklistProvider = ChecklistContext.Provider;

export function useChecklistPage(): ChecklistController {
  const controller = useContext(ChecklistContext);
  if (controller === null) throw new Error("useChecklistPage must be used inside ChecklistPage");
  return controller;
}
