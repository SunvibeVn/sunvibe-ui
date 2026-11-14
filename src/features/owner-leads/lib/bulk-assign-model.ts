import type { AssignLeadsResult } from "../types";

import type { LeadSelection } from "./lead-selection-state";

type Outcome = AssignLeadsResult["results"][number]["outcome"];

/** The outcome of one line; `other` for a value this screen does not know or a lead the answer left out (P-6). */
export type BulkAssignLineOutcome = Outcome | "other";

export type BulkAssignLine = { leadId: string; code: string; outcome: BulkAssignLineOutcome };

export type BulkAssignModel = {
  lines: BulkAssignLine[];
  totals: { assigned: number; unchanged: number; notAssigned: number };
  /** True when a lead was not assigned: the user may select it again in the reloaded list. */
  showRetryHint: boolean;
};

const OUTCOMES: readonly string[] = [
  "ASSIGNED",
  "ALREADY_ASSIGNED",
  "STALE",
  "CLOSED",
  "NOT_FOUND",
] satisfies readonly Outcome[];

const isOutcome = (value: unknown): value is Outcome => typeof value === "string" && OUTCOMES.includes(value);

/**
 * The result panel of one bulk assignment (acquisition-owner-lead-bulk-assign spec 6.1, D-6): one line per lead that
 * was sent, in request order, with the request code of the snapshot (the answer carries none) and the outcome of the
 * answer's item for that lead. `ALREADY_ASSIGNED` counts as unchanged; every outcome but `ASSIGNED` and
 * `ALREADY_ASSIGNED`, an unknown value or a missing item counts as not assigned (P-6).
 */
export function toBulkAssignModel(sent: LeadSelection, result: AssignLeadsResult): BulkAssignModel {
  const byLead = new Map<string, unknown>();
  for (const item of Array.isArray(result.results) ? result.results : []) {
    if (!byLead.has(item.leadId)) byLead.set(item.leadId, item.outcome);
  }

  const totals = { assigned: 0, unchanged: 0, notAssigned: 0 };
  const lines = sent.map((lead): BulkAssignLine => {
    const value = byLead.get(lead.id);
    const outcome: BulkAssignLineOutcome = isOutcome(value) ? value : "other";
    if (outcome === "ASSIGNED") totals.assigned += 1;
    else if (outcome === "ALREADY_ASSIGNED") totals.unchanged += 1;
    else totals.notAssigned += 1;
    return { leadId: lead.id, code: lead.requestCode, outcome };
  });

  return { lines, totals, showRetryHint: totals.notAssigned > 0 };
}
