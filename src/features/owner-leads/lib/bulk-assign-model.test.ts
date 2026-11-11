import { describe, expect, it } from "vitest";

import type { AssignLeadsResult } from "../types";

import { toBulkAssignModel } from "./bulk-assign-model";
import type { LeadSelection, SelectedLead } from "./lead-selection-state";

const selected = (id: string, requestCode: string): SelectedLead => ({
  id,
  requestCode,
  version: 1,
  assignedUserId: null,
  status: "NEW",
});

const SENT: LeadSelection = [
  selected("L1", "SV-AAAA-0001"),
  selected("L2", "SV-AAAA-0002"),
  selected("L3", "SV-AAAA-0003"),
  selected("L4", "SV-AAAA-0004"),
  selected("L5", "SV-AAAA-0005"),
];

describe("toBulkAssignModel (acquisition-owner-lead-bulk-assign 6.1, D-6, P-6)", () => {
  it("gives one line per sent lead in request order, with the code of the snapshot, and the three totals", () => {
    // The answer comes in request order; the model follows the snapshot even when an answer would not.
    const result: AssignLeadsResult = {
      results: [
        { leadId: "L5", outcome: "NOT_FOUND" },
        { leadId: "L1", outcome: "ASSIGNED" },
        { leadId: "L2", outcome: "ALREADY_ASSIGNED" },
        { leadId: "L3", outcome: "STALE" },
        { leadId: "L4", outcome: "CLOSED" },
      ],
    };

    expect(toBulkAssignModel(SENT, result)).toEqual({
      lines: [
        { leadId: "L1", code: "SV-AAAA-0001", outcome: "ASSIGNED" },
        { leadId: "L2", code: "SV-AAAA-0002", outcome: "ALREADY_ASSIGNED" },
        { leadId: "L3", code: "SV-AAAA-0003", outcome: "STALE" },
        { leadId: "L4", code: "SV-AAAA-0004", outcome: "CLOSED" },
        { leadId: "L5", code: "SV-AAAA-0005", outcome: "NOT_FOUND" },
      ],
      totals: { assigned: 1, unchanged: 1, notAssigned: 3 },
      showRetryHint: true,
    });
  });

  it("reads an unknown outcome value and a lead missing from the answer as other, not assigned", () => {
    const sent = SENT.slice(0, 3);
    const result = {
      results: [
        { leadId: "L1", outcome: "ASSIGNED" },
        { leadId: "L2", outcome: "MOVED_TO_MARS" },
      ],
    } as unknown as AssignLeadsResult;

    expect(toBulkAssignModel(sent, result)).toEqual({
      lines: [
        { leadId: "L1", code: "SV-AAAA-0001", outcome: "ASSIGNED" },
        { leadId: "L2", code: "SV-AAAA-0002", outcome: "other" },
        { leadId: "L3", code: "SV-AAAA-0003", outcome: "other" },
      ],
      totals: { assigned: 1, unchanged: 0, notAssigned: 2 },
      showRetryHint: true,
    });
  });

  it("reads an answer without results as every lead not assigned", () => {
    const model = toBulkAssignModel(SENT.slice(0, 1), {} as AssignLeadsResult);
    expect(model.lines).toEqual([{ leadId: "L1", code: "SV-AAAA-0001", outcome: "other" }]);
    expect(model.totals).toEqual({ assigned: 0, unchanged: 0, notAssigned: 1 });
  });

  it("shows the retry hint only when a lead was not assigned", () => {
    const sent = SENT.slice(0, 2);
    const allDone: AssignLeadsResult = {
      results: [
        { leadId: "L1", outcome: "ASSIGNED" },
        { leadId: "L2", outcome: "ALREADY_ASSIGNED" },
      ],
    };
    const model = toBulkAssignModel(sent, allDone);
    expect(model.totals).toEqual({ assigned: 1, unchanged: 1, notAssigned: 0 });
    expect(model.showRetryHint).toBe(false);
  });
});
