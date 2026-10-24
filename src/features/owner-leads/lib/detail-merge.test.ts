import { describe, expect, it } from "vitest";

import type { LeadActivity, LeadDetail, LeadNoteResult, LeadSummary } from "../types";

import { applySurveyCommandResult, mergeNoteResult, mergeSummary } from "./detail-merge";

const submitted: LeadActivity = { type: "SUBMITTED", occurredAt: "2026-10-18T01:00:00Z" };

const detail: LeadDetail = {
  id: "L1",
  requestCode: "SV-AAAA-BBBB",
  status: "ASSIGNED",
  version: 3,
  phone: "0909123456",
  contactName: "An",
  assignedUserId: "U1",
  assignedUserName: "Bình",
  nextActionAt: "2026-10-20T02:00:00Z",
  activities: [submitted],
};

const noteActivity: LeadActivity = {
  type: "NOTE_ADDED",
  occurredAt: "2026-10-18T03:00:00Z",
  note: "Gọi lại sau",
  actorUserId: "U1",
  actorName: "Bình",
};

describe("mergeNoteResult (C-36: the 201 body updates the page, no reload)", () => {
  const lead: LeadSummary = {
    id: "L1",
    status: "ASSIGNED",
    version: 4,
    assignedUserId: "U1",
    assignedUserName: "Bình",
    nextActionAt: "2026-10-25T02:00:00Z",
    lastActivityAt: "2026-10-24T02:00:00Z",
  };

  it("appends the activity and takes version and next action from the lead, keeping the contact data", () => {
    const next = mergeNoteResult(detail, { activity: noteActivity, lead });
    expect(next.activities).toEqual([submitted, noteActivity]);
    expect(next.version).toBe(4);
    expect(next.nextActionAt).toBe("2026-10-25T02:00:00Z");
    expect(next.phone).toBe("0909123456");
    expect(next.requestCode).toBe("SV-AAAA-BBBB");
  });

  it("does not add the same entry twice (a reload may already hold it)", () => {
    const once = mergeNoteResult(detail, { activity: noteActivity, lead });
    const twice = mergeNoteResult(once, { activity: { ...noteActivity }, lead });
    expect(twice.activities).toHaveLength(2);
  });

  it("copes with a body without activity or lead", () => {
    expect(mergeNoteResult(detail, {} as LeadNoteResult)).toEqual(detail);
  });
});

describe("mergeSummary (version from every 2xx, even if the reload that follows fails)", () => {
  it("takes status, version, assignee and next action; an absent next action means none", () => {
    const next = mergeSummary(detail, { id: "L1", status: "REJECTED", version: 5, assignedUserId: "U1", lastActivityAt: "2026-10-24T02:00:00Z" });
    expect(next.status).toBe("REJECTED");
    expect(next.version).toBe(5);
    expect(next.nextActionAt).toBeUndefined();
    expect(next.assignedUserName).toBeUndefined();
    expect(next.activities).toEqual([submitted]);
    expect(next.phone).toBe("0909123456");
  });
});

describe("applySurveyCommandResult (A-23: the answer updates the page, no reload)", () => {
  const booked = {
    type: "SURVEY_BOOKED" as const,
    actorUserId: "U1",
    actorName: "Bình",
    fromStatus: "ASSIGNED",
    toStatus: "SURVEY_SCHEDULED",
    note: null,
    nextActionAt: null,
    occurredAt: "2026-10-23T03:00:00Z",
    referenceId: "A1",
    referenceNo: 1,
  };

  it("takes status and version from the answer and appends its history row once", () => {
    const result = { lead: { id: "L1", status: "SURVEY_SCHEDULED" as const, version: 4 }, historyEntry: booked };
    const merged = applySurveyCommandResult(detail, result);
    expect(merged.status).toBe("SURVEY_SCHEDULED");
    expect(merged.version).toBe(4);
    expect(merged.activities).toHaveLength(2);
    expect(merged.activities?.[1]).toMatchObject({ type: "SURVEY_BOOKED", referenceNo: 1, toStatus: "SURVEY_SCHEDULED" });
    expect(applySurveyCommandResult(merged, result).activities).toHaveLength(2);
  });

  it("reads a status the workspace does not know as no status on the row", () => {
    const merged = applySurveyCommandResult(detail, {
      lead: { status: "ASSIGNED", version: 4 },
      historyEntry: { ...booked, fromStatus: null, toStatus: "SOMETHING" },
    });
    expect(merged.activities?.[1].toStatus).toBeUndefined();
    expect(merged.activities?.[1].fromStatus).toBeUndefined();
  });

  it("changes nothing for a no-op answer (no history row)", () => {
    expect(applySurveyCommandResult(detail, { lead: { status: "ASSIGNED", version: 3 }, historyEntry: null })).toBe(detail);
  });

  it("keeps status and version when the answer has none", () => {
    const merged = applySurveyCommandResult(detail, { lead: null, historyEntry: booked });
    expect(merged.status).toBe("ASSIGNED");
    expect(merged.version).toBe(3);
  });
});
