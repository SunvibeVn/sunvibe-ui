import { describe, expect, it } from "vitest";

import { toCancelBody, validateCancel } from "./cancel-form";
import { toResumeBody, validateResume } from "./resume-form";

/** 2026-10-25 10:20 in Vietnam. */
const NOW = Date.parse("2026-10-25T03:20:00Z");

describe("cancel form (US-2 AC-2, A-26)", () => {
  it("asks for one of the five user reasons", () => {
    expect(validateCancel({ reason: "", description: "" })).toEqual({ reason: "required" });
    expect(validateCancel({ reason: "LEAD_CLOSED", description: "" })).toEqual({ reason: "invalid" });
    expect(validateCancel({ reason: "OWNER_ABSENT", description: "" })).toEqual({});
  });

  it("asks for a description with Other only, up to 500 characters without a phone number", () => {
    expect(validateCancel({ reason: "OTHER", description: " " })).toEqual({ description: "required" });
    expect(validateCancel({ reason: "OTHER", description: "Road closed" })).toEqual({});
    expect(validateCancel({ reason: "NO_ACCESS", description: "a".repeat(501) })).toEqual({ description: "tooLong" });
    expect(validateCancel({ reason: "NO_ACCESS", description: "Call 0905 123 456" })).toEqual({ description: "phone" });
  });

  it("sends the reason and a trimmed description, none when blank", () => {
    expect(toCancelBody({ reason: "OTHER", description: " Road closed " }, { leadVersion: 4, appointmentVersion: 2 })).toEqual({
      expectedLeadVersion: 4,
      expectedAppointmentVersion: 2,
      cancelReason: "OTHER",
      description: "Road closed",
    });
    expect(toCancelBody({ reason: "OWNER_ABSENT", description: "  " }, { leadVersion: 4, appointmentVersion: 2 })).toEqual({
      expectedLeadVersion: 4,
      expectedAppointmentVersion: 2,
      cancelReason: "OWNER_ABSENT",
    });
  });
});

describe("resume form (BR-11, B-6, A-25)", () => {
  const ctx = { now: NOW };

  it("asks for reason, date and text", () => {
    expect(validateResume({ reason: "", basisDate: "", basisText: "" }, ctx)).toEqual({
      reason: "required",
      basisDate: "required",
      basisText: "required",
    });
  });

  it("dates the basis not after today and refuses phone numbers", () => {
    const base = { reason: "Owner is back", basisText: "Owner confirmed nothing changed" };
    expect(validateResume({ ...base, basisDate: "2026-10-26" }, ctx)).toEqual({ basisDate: "tooLate" });
    expect(validateResume({ ...base, basisDate: "2026-10-25" }, ctx)).toEqual({});
    expect(validateResume({ ...base, reason: "0905 123 456", basisDate: "2026-10-20" }, ctx)).toEqual({ reason: "phone" });
  });

  it("sends reason and basis, trimmed", () => {
    expect(
      toResumeBody({ reason: " Owner is back ", basisDate: "2026-10-25", basisText: " Same scope " }, { leadVersion: 6 }),
    ).toEqual({ expectedLeadVersion: 6, reason: "Owner is back", basis: { confirmedOn: "2026-10-25", text: "Same scope" } });
  });
});
