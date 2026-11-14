import type { ApiResult } from "@/features/auth/client";

import { assignLeads, type AssignLeadsInput } from "../services/owner-leads-api";
import type { AssignLeadsResult } from "../types";

import type { LeadSelection } from "./lead-selection-state";
import { toLeadUiError } from "./lead-ui-error";
import { NOTE_MAX, utf16Length } from "./note-length";

/** Most leads one bulk assignment holds (acquisition-owner-lead-bulk-assign BR-3). */
export const MAX_BULK_LEADS = 20;

export type BulkAssignProblems = { assignee?: "required"; note?: "tooLong"; leads?: "count" };

export type BulkAssignStep = { kind: "invalid"; problems: BulkAssignProblems } | { kind: "send"; request: AssignLeadsInput };

/** The 400 fields the dialog shows at an input; any other field reads as the general message (D-11). */
const DIALOG_FIELDS: readonly string[] = ["assigneeUserId", "note"];

/**
 * Checks the bulk dialog (acquisition-owner-lead-bulk-assign BR-3, BR-6): a person is required, 1 to 20 leads, the note
 * is optional (at most 2000 UTF-16 units, trimmed, left out when blank). The request carries the ids and the versions
 * of the selection snapshot, in selection order (AC-19).
 */
export function prepareBulkAssign(input: { selected: string; leads: LeadSelection; note: string }): BulkAssignStep {
  const problems: BulkAssignProblems = {};
  if (input.selected === "") problems.assignee = "required";
  if (utf16Length(input.note) > NOTE_MAX) problems.note = "tooLong";
  if (input.leads.length < 1 || input.leads.length > MAX_BULK_LEADS) problems.leads = "count";
  if (Object.keys(problems).length > 0) return { kind: "invalid", problems };

  const request: AssignLeadsInput = {
    assigneeUserId: input.selected,
    leads: input.leads.map((lead) => ({ leadId: lead.id, expectedVersion: lead.version })),
  };
  const note = input.note.trim();
  if (note !== "") request.note = note;
  return { kind: "send", request };
}

/** What one bulk request ended with, for the dialog (acquisition-owner-lead-bulk-assign D-11). */
export type BulkAssignOutcome =
  | { kind: "done"; result: AssignLeadsResult }
  /** A 400 on the person or the note: messages at those inputs. */
  | { kind: "fields"; fields: string[]; correlationId: string | null }
  /** Any other 400 (the general message), 422, 403, a whole-request 409, or an outcome nobody can tell. */
  | { kind: "rejected" | "ineligible" | "forbidden" | "conflict" | "unknown"; correlationId: string | null }
  /** The session ended: its own flow takes the user to sign-in. */
  | { kind: "signed-out" };

/** What the dialog hands to the list view when the action ends outside the dialog (D-10, D-11). */
export type BulkAssignEnd =
  | { kind: "result"; sent: LeadSelection; result: AssignLeadsResult }
  | { kind: "conflict" | "unknown"; correlationId: string | null };

export type BulkAssignFlowDeps = {
  assignLeads(input: AssignLeadsInput): Promise<ApiResult<AssignLeadsResult>>;
};

const DEFAULT_DEPS: BulkAssignFlowDeps = { assignLeads: (input) => assignLeads(input) };

/**
 * Sends one bulk assignment and maps the answer (acquisition-owner-lead-bulk-assign D-11): 400 on `assigneeUserId` or
 * `note` → `fields`, any other 400 → `rejected`; 422 → `ineligible`; 403 → `forbidden`; every 409 → `conflict`
 * (nothing was assigned); a lost answer, an unavailable session, 404, 429, 5xx and any other status → `unknown`.
 */
export async function sendBulkAssign(
  request: AssignLeadsInput,
  deps: BulkAssignFlowDeps = DEFAULT_DEPS,
): Promise<BulkAssignOutcome> {
  const result = await deps.assignLeads(request);
  if (result.ok) return { kind: "done", result: result.data };

  const error = toLeadUiError(result);
  const correlationId = error?.correlationId ?? null;
  switch (error?.kind) {
    case "signed-out":
      return { kind: "signed-out" };
    case "validation": {
      const fields = Object.keys(error.fieldErrors ?? {}).filter((field) => DIALOG_FIELDS.includes(field));
      return fields.length > 0 ? { kind: "fields", fields, correlationId } : { kind: "rejected", correlationId };
    }
    case "ineligible":
      return { kind: "ineligible", correlationId };
    case "forbidden":
      return { kind: "forbidden", correlationId };
    case "stale":
    case "invalid-transition":
      return { kind: "conflict", correlationId };
    default:
      return { kind: "unknown", correlationId };
  }
}
