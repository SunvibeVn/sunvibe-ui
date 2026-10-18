import type { ApiResult } from "@/features/auth/client";

import { assignLead, type AssignLeadInput } from "../services/owner-leads-api";
import type { LeadSummary } from "../types";

import {
  type CommandFailure,
  type CommandMessage,
  type CommandOutcome,
  failureMessage,
  toCommandOutcome,
} from "./command-flow";
import { NOTE_MAX, utf16Length } from "./note-length";

/** The assign body without the version, which is added at send time (spec 5.2). */
export type AssignRequest = Omit<AssignLeadInput, "expectedVersion">;

export type AssignProblems = { assignee?: "required"; note?: "tooLong" };

export type AssignStep =
  | { kind: "invalid"; problems: AssignProblems }
  /** The person already holds the lead: no call, the dialog just closes (US-7). */
  | { kind: "unchanged" }
  | { kind: "send"; request: AssignRequest };

export type AssignFlowDeps = {
  assignLead(leadId: string, input: AssignLeadInput): Promise<ApiResult<LeadSummary>>;
};

const DEFAULT_DEPS: AssignFlowDeps = { assignLead: (leadId, input) => assignLead(leadId, input) };

/**
 * Checks the assign dialog (US-7, C-29): a person is required, the note is optional (trimmed, at most 2000 units,
 * a blank note is left out) and the current assignee sends nothing.
 */
export function prepareAssign(input: {
  /** The picked user id; "" when none. */
  selected: string;
  currentAssigneeId: string | null | undefined;
  note: string;
}): AssignStep {
  const problems: AssignProblems = {};
  if (input.selected === "") problems.assignee = "required";
  if (utf16Length(input.note) > NOTE_MAX) problems.note = "tooLong";
  if (Object.keys(problems).length > 0) return { kind: "invalid", problems };
  if (input.selected === input.currentAssigneeId) return { kind: "unchanged" };

  const request: AssignRequest = { assigneeUserId: input.selected };
  const note = input.note.trim();
  if (note !== "") request.note = note;
  return { kind: "send", request };
}

/** Sends an assignment with the version of the last detail or command answer (spec 5.2). */
export async function sendAssign(
  leadId: string,
  request: AssignRequest,
  expectedVersion: number,
  deps: AssignFlowDeps = DEFAULT_DEPS,
): Promise<CommandOutcome> {
  return toCommandOutcome(await deps.assignLead(leadId, { ...request, expectedVersion }));
}

/** What the assign dialog does after a failed assignment (spec 5.2). */
export type AssignFollowUp =
  /** Shows `message` (kept by the actions slot) and reloads the lead or the assignee list, or nothing. */
  | { kind: "message"; message: CommandMessage | null; reload: "lead" | "assignees" | "none" }
  /** A 400 on fields of the dialog: their messages at the inputs, with the support code. */
  | { kind: "fields"; fields: string[]; correlationId: string | null }
  /** 404: back to the list with the notice (C-37). */
  | { kind: "leave" };

/**
 * Maps a failed assignment: 409 `INVALID_STATE_TRANSITION` gives the transition message (with the allowed statuses, R9)
 * and 409 `CONCURRENT_MODIFICATION` the stale one, both with a reload of the lead; 422 reloads the assignee list (E-6);
 * a 400 on `fields` stays at the inputs, any other 400 is the general message.
 */
export function assignFollowUp(failure: CommandFailure, fields: readonly string[]): AssignFollowUp {
  switch (failure.kind) {
    case "gone":
      return { kind: "leave" };
    case "stale":
    case "invalid-transition":
      return { kind: "message", message: failureMessage(failure), reload: "lead" };
    case "ineligible":
      return { kind: "message", message: failureMessage(failure), reload: "assignees" };
    case "rejected": {
      const known = failure.fields.filter((field) => fields.includes(field));
      return known.length === 0
        ? { kind: "message", message: failureMessage(failure), reload: "none" }
        : { kind: "fields", fields: known, correlationId: failure.correlationId ?? null };
    }
    default:
      return { kind: "message", message: failureMessage(failure), reload: "none" };
  }
}
