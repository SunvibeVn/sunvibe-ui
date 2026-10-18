import { CLOSED_STATUSES, type LeadStatus } from "../types";

/**
 * Client copy of the transition table (acquisition BR-3), used only to decide which targets the status dialog
 * offers. The API stays the authority: an invalid target answers 409 `INVALID_STATE_TRANSITION` with `allowedValues`.
 */
const TARGETS: Record<LeadStatus, readonly LeadStatus[]> = {
  NEW: ["DUPLICATE", "REJECTED", "WITHDRAWN"],
  ASSIGNED: ["CONTACTED", "ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"],
  CONTACTED: ["ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"],
  ON_HOLD: ["CONTACTED", "DUPLICATE", "REJECTED", "WITHDRAWN"],
  DUPLICATE: [],
  REJECTED: [],
  WITHDRAWN: [],
};

/** Statuses a lead in `status` may move to; empty for a closed lead. A new array on every call. */
export function allowedTargets(status: LeadStatus): LeadStatus[] {
  return [...TARGETS[status]];
}

/** True when moving to `status` closes the lead for good (asks for a reason and a confirmation). */
export function isClosing(status: LeadStatus): boolean {
  return (CLOSED_STATUSES as readonly string[]).includes(status);
}
