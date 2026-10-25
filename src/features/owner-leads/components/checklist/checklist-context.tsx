"use client";

import { createContext, useContext } from "react";

import type {
  ChecklistGroupPath,
  ChecklistSaveBody,
  ChecklistTakeoverInput,
  ChecklistUiError,
  ChecklistView,
} from "@/features/surveys";

import type { GroupContext } from "../../lib/checklist/group-input";
import type { EarlierChecklist } from "../../lib/checklist/page-notices";
import type { PageMessage, PanelLocks } from "../../lib/checklist/page-state";
import type { ChecklistRules } from "../../schemas/checklist";

/** What a save or a takeover gave the part that sent it; page-level outcomes (404, read-only) are handled already. */
export type CommandOutcome = { kind: "saved" } | { kind: "failed"; error: ChecklistUiError };

/** A message the page shows above the tabs. */
export type ChecklistPageMessage = PageMessage | "takeoverStale" | "takeoverNotAllowed" | "surveyorIneligible";

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
  /** A refusal the page answers itself (404: drafts and data dropped, back to the list); true when it did. */
  fail(error: ChecklistUiError): Promise<boolean>;
  reload(): Promise<void>;
};

const ChecklistContext = createContext<ChecklistController | null>(null);

export const ChecklistProvider = ChecklistContext.Provider;

export function useChecklistPage(): ChecklistController {
  const controller = useContext(ChecklistContext);
  if (controller === null) throw new Error("useChecklistPage must be used inside ChecklistPage");
  return controller;
}
