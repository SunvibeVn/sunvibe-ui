import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { AssignLeadInput } from "../services/owner-leads-api";
import type { LeadSummary } from "../types";

import { assignFollowUp, type AssignFlowDeps, prepareAssign, sendAssign } from "./assign-flow";

describe("prepareAssign (US-7)", () => {
  it("needs a person", () => {
    expect(prepareAssign({ selected: "", currentAssigneeId: undefined, note: "" })).toEqual({
      kind: "invalid",
      problems: { assignee: "required" },
    });
  });

  it("sends nothing for the current assignee", () => {
    expect(prepareAssign({ selected: "U1", currentAssigneeId: "U1", note: "x" })).toEqual({ kind: "unchanged" });
  });

  it("sends the person and the trimmed note; a blank note is left out", () => {
    expect(prepareAssign({ selected: "U2", currentAssigneeId: "U1", note: "  Khu của bạn  " })).toEqual({
      kind: "send",
      request: { assigneeUserId: "U2", note: "Khu của bạn" },
    });
    expect(prepareAssign({ selected: "U2", currentAssigneeId: null, note: " \n " })).toEqual({
      kind: "send",
      request: { assigneeUserId: "U2" },
    });
  });

  it("refuses a note over 2000 units", () => {
    expect(prepareAssign({ selected: "U2", currentAssigneeId: undefined, note: "a".repeat(2001) })).toEqual({
      kind: "invalid",
      problems: { note: "tooLong" },
    });
  });
});

describe("sendAssign", () => {
  it("adds the expected version and maps the answer", async () => {
    const sent: { leadId: string; input: AssignLeadInput }[] = [];
    const reply: ApiResult<LeadSummary> = {
      ok: false,
      kind: "http",
      status: 422,
      code: "INELIGIBLE_ASSIGNEE",
      fieldErrors: [],
    };
    const flowDeps: AssignFlowDeps = {
      assignLead: async (leadId, input) => {
        sent.push({ leadId, input });
        return reply;
      },
    };
    expect(await sendAssign("L1", { assigneeUserId: "U2" }, 3, flowDeps)).toEqual({ kind: "ineligible" });
    expect(sent).toEqual([{ leadId: "L1", input: { assigneeUserId: "U2", expectedVersion: 3 } }]);
  });
});

describe("assignFollowUp (spec 5.2 for the assign dialog)", () => {
  const FIELDS = ["assigneeUserId", "note"] as const;

  it("409 INVALID_STATE_TRANSITION shows the transition message (with the allowed statuses) and reloads the lead (R9)", () => {
    expect(
      assignFollowUp({ kind: "invalid-transition", allowed: ["CONTACTED"], correlationId: "c-9" }, FIELDS),
    ).toEqual({
      kind: "message",
      message: { kind: "invalid-transition", allowed: ["CONTACTED"], correlationId: "c-9" },
      reload: "lead",
    });
    expect(assignFollowUp({ kind: "invalid-transition" }, FIELDS)).toEqual({
      kind: "message",
      message: { kind: "invalid-transition" },
      reload: "lead",
    });
  });

  it("409 CONCURRENT_MODIFICATION shows the stale message and reloads the lead", () => {
    expect(assignFollowUp({ kind: "stale", correlationId: "c-1" }, FIELDS)).toEqual({
      kind: "message",
      message: { kind: "stale", correlationId: "c-1" },
      reload: "lead",
    });
  });

  it("422 shows the ineligible message and reloads the assignee list (E-6)", () => {
    expect(assignFollowUp({ kind: "ineligible" }, FIELDS)).toEqual({
      kind: "message",
      message: { kind: "ineligible" },
      reload: "assignees",
    });
  });

  it("400 on a field of the dialog stays at the field; any other 400 is the general message", () => {
    expect(assignFollowUp({ kind: "rejected", fields: ["note", "other"], correlationId: "c-4" }, FIELDS)).toEqual({
      kind: "fields",
      fields: ["note"],
      correlationId: "c-4",
    });
    expect(assignFollowUp({ kind: "rejected", fields: ["note"] }, FIELDS)).toEqual({
      kind: "fields",
      fields: ["note"],
      correlationId: null,
    });
    expect(assignFollowUp({ kind: "rejected", fields: ["other"], correlationId: "c-5" }, FIELDS)).toEqual({
      kind: "message",
      message: { kind: "bad-request", correlationId: "c-5" },
      reload: "none",
    });
  });

  it("404 leaves for the list; 403 and retry cases show their message", () => {
    expect(assignFollowUp({ kind: "gone" }, FIELDS)).toEqual({ kind: "leave" });
    expect(assignFollowUp({ kind: "forbidden", correlationId: "c-3" }, FIELDS)).toEqual({
      kind: "message",
      message: { kind: "forbidden", correlationId: "c-3" },
      reload: "none",
    });
    expect(assignFollowUp({ kind: "failed" }, FIELDS)).toEqual({
      kind: "message",
      message: { kind: "failed" },
      reload: "none",
    });
  });
});
