import { describe, expect, it } from "vitest";

import type { SurveyAppointment, SurveyBlock } from "@/features/surveys";

import {
  bookingBlockKey,
  checklistLineReason,
  dialogAppointment,
  earlierAppointments,
  holderOptions,
  passedNoteKey,
  placeDiffersFromLead,
  placeOf,
  resumesToQualified,
  revisionChip,
  scheduledAppointment,
  visitMode,
} from "./appointment-view";

const LEAD_PLACE = { addressText: "25 Trần Phú", wardCode: "20242", latitude: 16.0715, longitude: 108.2239 };

describe("placeDiffersFromLead (A-16)", () => {
  it("is false for the lead's own place, whatever the spacing, case or Unicode form of the address", () => {
    expect(placeDiffersFromLead(LEAD_PLACE, LEAD_PLACE)).toBe(false);
    expect(placeDiffersFromLead({ ...LEAD_PLACE, addressText: "  25   TRẦN  phú " }, LEAD_PLACE)).toBe(false);
    // "ầ" written as a + combining marks (NFD) is the same address once NFC.
    expect(placeDiffersFromLead({ ...LEAD_PLACE, addressText: "25 Trần Phú" }, LEAD_PLACE)).toBe(false);
  });

  it("is true when the address, the ward or the pin differs", () => {
    expect(placeDiffersFromLead({ ...LEAD_PLACE, addressText: "27 Trần Phú" }, LEAD_PLACE)).toBe(true);
    expect(placeDiffersFromLead({ ...LEAD_PLACE, wardCode: "20257" }, LEAD_PLACE)).toBe(true);
    expect(placeDiffersFromLead({ ...LEAD_PLACE, latitude: 16.0716 }, LEAD_PLACE)).toBe(true);
    expect(placeDiffersFromLead({ ...LEAD_PLACE, latitude: null, longitude: null }, LEAD_PLACE)).toBe(true);
  });

  it("treats a missing pin on both sides as the same", () => {
    const noPin = { ...LEAD_PLACE, latitude: null, longitude: null };
    expect(placeDiffersFromLead(noPin, noPin)).toBe(false);
  });
});

describe("placeOf", () => {
  it("reads a place of the API with nulls as an editable place", () => {
    expect(placeOf({ addressText: "25 Trần Phú", wardCode: "20242", latitude: null, longitude: null })).toEqual({
      addressText: "25 Trần Phú",
      wardCode: "20242",
      latitude: null,
      longitude: null,
    });
    expect(placeOf(null)).toEqual({ addressText: "", wardCode: "", latitude: null, longitude: null });
  });
});

const appointment = (extra: SurveyAppointment = {}): SurveyAppointment => ({
  id: "A1",
  appointmentNo: 1,
  status: "SCHEDULED",
  surveyorUserId: "U1",
  surveyorName: "Sale One",
  holders: [
    { userId: "U1", name: "Sale One", from: "2026-10-25T01:00:00Z", to: "2026-10-25T02:00:00Z" },
    { userId: "U2", name: "Sale Two", from: "2026-10-25T02:00:00Z", to: null },
  ],
  ...extra,
});

describe("scheduledAppointment and earlierAppointments (spec 6.1)", () => {
  const block: SurveyBlock = {
    appointments: [
      appointment({ id: "A3", appointmentNo: 3, status: "SCHEDULED" }),
      appointment({ id: "A2", appointmentNo: 2, status: "VISITED" }),
      appointment({ id: "A1", appointmentNo: 1, status: "CANCELLED" }),
    ],
  };

  it("finds the one SCHEDULED appointment", () => {
    expect(scheduledAppointment(block)?.id).toBe("A3");
    expect(scheduledAppointment({ appointments: [] })).toBeUndefined();
    expect(scheduledAppointment(null)).toBeUndefined();
  });

  it("lists the others newest first, as the API sends them", () => {
    expect(earlierAppointments(block).map((entry) => entry.id)).toEqual(["A2", "A1"]);
    expect(earlierAppointments({ appointments: null })).toEqual([]);
  });

  it("gives an open dialog its appointment only while that one is still scheduled (a reload after a conflict)", () => {
    expect(dialogAppointment(block, "A3")?.id).toBe("A3");
    // Cancelled and booked again by someone else: the dialog of A3 must not edit A4.
    const rebooked: SurveyBlock = { appointments: [appointment({ id: "A4", appointmentNo: 4, status: "SCHEDULED" })] };
    expect(dialogAppointment(rebooked, "A3")).toBeNull();
    expect(dialogAppointment({ appointments: [] }, "A3")).toBeNull();
  });
});

describe("holderOptions", () => {
  it("lists each holder once, the current surveyor first", () => {
    const withRepeat = appointment({
      surveyorUserId: "U2",
      holders: [
        { userId: "U1", name: "Sale One", from: "a", to: "b" },
        { userId: "U2", name: "Sale Two", from: "b", to: "c" },
        { userId: "U1", name: "Sale One", from: "c", to: "d" },
        { userId: "U2", name: null, from: "d", to: null },
      ],
    });
    expect(holderOptions(withRepeat)).toEqual([
      { userId: "U2", name: "Sale Two" },
      { userId: "U1", name: "Sale One" },
    ]);
  });

  it("is empty without holders", () => {
    expect(holderOptions(appointment({ holders: null, surveyorUserId: null }))).toEqual([]);
  });
});

describe("visitMode (A-8)", () => {
  it("is own only for the current surveyor recording their own visit", () => {
    expect(visitMode("U1", appointment(), "U1")).toBe("own");
  });

  it("is proxy for anyone else, or for the surveyor naming someone else", () => {
    expect(visitMode("U9", appointment(), "U1")).toBe("proxy");
    expect(visitMode("U1", appointment(), "U2")).toBe("proxy");
    expect(visitMode("U1", appointment({ surveyorUserId: "U2" }), "U1")).toBe("proxy");
  });
});

describe("the survey record in the Survey section (survey-checklist submission 6.2)", () => {
  it("names a booking refused by a submitted or a passed checklist", () => {
    expect(bookingBlockKey({ booking: { allowed: false, blockedBy: "CHECKLIST_SUBMITTED" } })).toBe("CHECKLIST_SUBMITTED");
    expect(bookingBlockKey({ booking: { allowed: false, blockedBy: "CHECKLIST_PASSED" } })).toBe("CHECKLIST_PASSED");
  });

  it("resumes to Qualified only when the block says so", () => {
    expect(resumesToQualified({ resume: { target: "QUALIFIED" } })).toBe(true);
    expect(resumesToQualified({ resume: { target: "SURVEY_SCHEDULED" } })).toBe(false);
    expect(resumesToQualified({ resume: { target: null } })).toBe(false);
    expect(resumesToQualified({})).toBe(false);
  });

  it("says why a pass of the cycle stopped being usable", () => {
    expect(passedNoteKey({ survey: { hasPassed: true, passed: { usable: false, reason: "EVIDENCE_HELD" } } })).toBe(
      "checklist.decision.passedReason.EVIDENCE_HELD",
    );
    expect(passedNoteKey({ survey: { hasPassed: true, passed: { usable: true, reason: null } } })).toBeNull();
    expect(passedNoteKey({ survey: { hasPassed: false, passed: null } })).toBeNull();
    expect(passedNoteKey({})).toBeNull();
  });

  it("gives a revision past the draft its chip", () => {
    expect(revisionChip({ status: "SUBMITTED" })).toEqual({ label: "checklist.lines.submitted", tone: "info" });
    expect(revisionChip({ status: "PASSED", outcome: "PASSED" })).toEqual({ label: "checklist.review.outcome.PASSED", tone: "success" });
    expect(revisionChip({ status: "NEEDS_CHANGES", outcome: "NEEDS_CHANGES" })).toEqual({
      label: "checklist.review.outcome.NEEDS_CHANGES",
      tone: "warning",
    });
    expect(revisionChip({ status: "FAILED", outcome: "FAILED" })).toEqual({ label: "checklist.review.outcome.FAILED", tone: "danger" });
  });

  it("gives a draft no chip: its line says Draft", () => {
    expect(revisionChip({ status: "DRAFT" })).toBeNull();
    expect(revisionChip({})).toBeNull();
  });

  it("shows the read-only reason of a draft only: the chip speaks for a frozen revision", () => {
    expect(checklistLineReason({ readOnlyReason: "NEWER_VISIT", editable: false })).toBe("checklist.readOnly.NEWER_VISIT");
    expect(checklistLineReason({ readOnlyReason: "SUBMITTED", editable: false })).toBeNull();
    expect(checklistLineReason({ readOnlyReason: "DECIDED", editable: false })).toBeNull();
    expect(checklistLineReason({ readOnlyReason: null, editable: true })).toBeNull();
    expect(checklistLineReason({ readOnlyReason: "NOT_ASSIGNEE", editable: true })).toBeNull();
  });
});

describe("bookingBlockKey (spec 6.1)", () => {
  it("names the reason booking is blocked", () => {
    expect(bookingBlockKey({ booking: { allowed: false, blockedBy: "NO_ASSIGNEE" } })).toBe("NO_ASSIGNEE");
    expect(bookingBlockKey({ booking: { allowed: false, blockedBy: "SURVEYOR_INELIGIBLE" } })).toBe(
      "SURVEYOR_INELIGIBLE",
    );
  });

  it("is null when booking is allowed, and a generic reason when the API named none", () => {
    expect(bookingBlockKey({ booking: { allowed: true, kind: "FIRST" } })).toBeNull();
    expect(bookingBlockKey({ booking: { allowed: false } })).toBe("UNKNOWN");
    expect(bookingBlockKey({ booking: { allowed: false, blockedBy: "LATER" as never } })).toBe("UNKNOWN");
    expect(bookingBlockKey({})).toBe("UNKNOWN");
  });
});
