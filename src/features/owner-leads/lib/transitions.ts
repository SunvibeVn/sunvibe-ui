import { CLOSED_STATUSES, type LeadStatus } from "../types";

/** The survey record of the lead's current cycle, as the survey block sends it; none while the block is not loaded. */
export type SurveyRecordFacts = { hasPassed?: boolean | null; hasSubmitted?: boolean | null };

/**
 * Client copy of the transition table (acquisition BR-3, survey-schedule spec 4.3, survey-checklist 4.8), used only to
 * decide which targets the status dialog offers. The API stays the authority: an invalid target answers 409
 * `INVALID_STATE_TRANSITION` with `allowedValues`.
 */
const TARGETS: Record<LeadStatus, readonly LeadStatus[]> = {
  NEW: ["DUPLICATE", "REJECTED", "WITHDRAWN"],
  ASSIGNED: ["CONTACTED", "ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"],
  CONTACTED: ["ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"],
  // Only a survey command moves a lead into SURVEY_SCHEDULED; out of it by hand: hold or close (survey-schedule BR-3).
  SURVEY_SCHEDULED: ["ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"],
  // Only a PASSED decision or a resume moves a lead into QUALIFIED (survey-checklist I-4).
  QUALIFIED: ["ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"],
  ON_HOLD: ["CONTACTED", "DUPLICATE", "REJECTED", "WITHDRAWN"],
  DUPLICATE: [],
  REJECTED: [],
  WITHDRAWN: [],
};

/**
 * Statuses a lead in `status` may move to; empty for a closed lead. A new array on every call. A held lead with a PASSED
 * or a SUBMITTED revision in its cycle cannot go back to Contacted (survey-checklist D3-8, D3-13).
 */
export function allowedTargets(status: LeadStatus, survey?: SurveyRecordFacts | null): LeadStatus[] {
  const targets = [...TARGETS[status]];
  if (status !== "ON_HOLD" || !(survey?.hasPassed || survey?.hasSubmitted)) return targets;
  return targets.filter((target) => target !== "CONTACTED");
}

/** True when moving to `status` closes the lead for good (asks for a reason and a confirmation). */
export function isClosing(status: LeadStatus): boolean {
  return (CLOSED_STATUSES as readonly string[]).includes(status);
}
