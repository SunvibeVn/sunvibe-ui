import { describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/features/auth/client";

import type { AssignLeadsInput } from "../services/owner-leads-api";
import type { AssignLeadsResult } from "../types";

import { MAX_BULK_LEADS, prepareBulkAssign, sendBulkAssign } from "./bulk-assign-flow";
import type { LeadSelection, SelectedLead } from "./lead-selection-state";

const selected = (id: string, version: number): SelectedLead => ({
  id,
  requestCode: `SV-${id}`,
  version,
  assignedUserId: "u-sale",
  status: "ASSIGNED",
});

const TWO: LeadSelection = [selected("L7", 1), selected("L9", 2)];
const many = (count: number): LeadSelection => Array.from({ length: count }, (_, i) => selected(`L${i}`, i));

describe("prepareBulkAssign (acquisition-owner-lead-bulk-assign BR-3, BR-6, AC-19)", () => {
  it("asks for a person", () => {
    expect(prepareBulkAssign({ selected: "", leads: TWO, note: "" })).toEqual({
      kind: "invalid",
      problems: { assignee: "required" },
    });
  });

  it("refuses no lead and more than twenty, and takes one and twenty", () => {
    expect(MAX_BULK_LEADS).toBe(20);
    expect(prepareBulkAssign({ selected: "u-lan", leads: [], note: "" })).toEqual({
      kind: "invalid",
      problems: { leads: "count" },
    });
    expect(prepareBulkAssign({ selected: "u-lan", leads: many(21), note: "" })).toEqual({
      kind: "invalid",
      problems: { leads: "count" },
    });
    expect(prepareBulkAssign({ selected: "u-lan", leads: many(1), note: "" }).kind).toBe("send");
    expect(prepareBulkAssign({ selected: "u-lan", leads: many(20), note: "" }).kind).toBe("send");
  });

  it("refuses a note over 2000 UTF-16 units and takes one of 2000", () => {
    expect(prepareBulkAssign({ selected: "u-lan", leads: TWO, note: "a".repeat(2001) })).toEqual({
      kind: "invalid",
      problems: { note: "tooLong" },
    });
    // An emoji counts two units, as the server counts it.
    expect(prepareBulkAssign({ selected: "u-lan", leads: TWO, note: `${"a".repeat(1999)}😀` })).toEqual({
      kind: "invalid",
      problems: { note: "tooLong" },
    });
    expect(prepareBulkAssign({ selected: "u-lan", leads: TWO, note: "a".repeat(2000) }).kind).toBe("send");
  });

  it("reports every problem at once", () => {
    expect(prepareBulkAssign({ selected: "", leads: [], note: "a".repeat(2001) })).toEqual({
      kind: "invalid",
      problems: { assignee: "required", note: "tooLong", leads: "count" },
    });
  });

  it("sends the person, the trimmed note and the ids and versions of the snapshot in selection order", () => {
    expect(prepareBulkAssign({ selected: "u-lan", leads: TWO, note: "  Chuyển lead  " })).toEqual({
      kind: "send",
      request: {
        assigneeUserId: "u-lan",
        note: "Chuyển lead",
        leads: [
          { leadId: "L7", expectedVersion: 1 },
          { leadId: "L9", expectedVersion: 2 },
        ],
      },
    });
  });

  it("leaves a blank note out", () => {
    const step = prepareBulkAssign({ selected: "u-lan", leads: TWO, note: "   " });
    expect(step.kind).toBe("send");
    if (step.kind === "send") expect(step.request).not.toHaveProperty("note");
  });
});

const REQUEST: AssignLeadsInput = { assigneeUserId: "u-lan", leads: [{ leadId: "L7", expectedVersion: 1 }] };

const http = (status: number, extra: { code?: string; fields?: string[]; correlationId?: string } = {}) =>
  ({
    ok: false,
    kind: "http",
    status,
    code: extra.code,
    fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
    correlationId: extra.correlationId,
  }) as ApiResult<AssignLeadsResult>;

async function send(answer: ApiResult<AssignLeadsResult>) {
  const assignLeads = vi.fn(async () => answer);
  const outcome = await sendBulkAssign(REQUEST, { assignLeads });
  expect(assignLeads).toHaveBeenCalledTimes(1);
  expect(assignLeads).toHaveBeenCalledWith(REQUEST);
  return outcome;
}

describe("sendBulkAssign (acquisition-owner-lead-bulk-assign D-11)", () => {
  it("hands back the answer of a 200", async () => {
    const result: AssignLeadsResult = { results: [{ leadId: "L7", outcome: "ASSIGNED" }] };
    expect(await send({ ok: true, status: 200, replayed: false, data: result })).toEqual({ kind: "done", result });
  });

  it("keeps a 400 on the person or the note at its input, with the support code", async () => {
    expect(await send(http(400, { code: "VALIDATION_FAILED", fields: ["note"], correlationId: "c0ffee12" }))).toEqual({
      kind: "fields",
      fields: ["note"],
      correlationId: "c0ffee12",
    });
    expect(await send(http(400, { fields: ["assigneeUserId", "leads[0].leadId"] }))).toEqual({
      kind: "fields",
      fields: ["assigneeUserId"],
      correlationId: null,
    });
  });

  it("reads any other 400 as the general message, in the bracket or the dotted form", async () => {
    for (const fields of [["leads[0].leadId"], ["leads.0.expectedVersion"], ["leads"], ["leads[0]"], []]) {
      expect(await send(http(400, { code: "VALIDATION_FAILED", fields, correlationId: "c1" }))).toEqual({
        kind: "rejected",
        correlationId: "c1",
      });
    }
    expect(await send(http(400, { code: "MALFORMED_REQUEST" }))).toEqual({ kind: "rejected", correlationId: null });
  });

  it("maps 422, 403 and every 409", async () => {
    expect(await send(http(422, { code: "INELIGIBLE_ASSIGNEE", fields: ["assigneeUserId"], correlationId: "c2" }))).toEqual(
      { kind: "ineligible", correlationId: "c2" },
    );
    expect(await send(http(403, { correlationId: "c3" }))).toEqual({ kind: "forbidden", correlationId: "c3" });
    expect(await send(http(409, { code: "CONCURRENT_MODIFICATION", fields: ["expectedVersion"] }))).toEqual({
      kind: "conflict",
      correlationId: null,
    });
    expect(await send(http(409, { code: "INVALID_STATE_TRANSITION", correlationId: "c4" }))).toEqual({
      kind: "conflict",
      correlationId: "c4",
    });
  });

  it("reads a lost answer, an unavailable session, 404, 429, 5xx and any other status as an unknown outcome", async () => {
    expect(await send({ ok: false, kind: "network" })).toEqual({ kind: "unknown", correlationId: null });
    expect(await send({ ok: false, kind: "unavailable" })).toEqual({ kind: "unknown", correlationId: null });
    for (const status of [404, 429, 500, 502, 503, 418]) {
      expect(await send(http(status, { correlationId: `c${status}` }))).toEqual({
        kind: "unknown",
        correlationId: `c${status}`,
      });
    }
  });

  it("leaves a sign-out to the session flow", async () => {
    expect(await send({ ok: false, kind: "signed-out" })).toEqual({ kind: "signed-out" });
  });
});
