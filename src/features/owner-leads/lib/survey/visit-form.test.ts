import { describe, expect, it } from "vitest";

import type { SurveyAppointment } from "@/features/surveys";

import { type VisitForm, toVisitBody, validateVisit, visitDefaults } from "./visit-form";

/** 2026-10-25 10:20:40 in Vietnam. */
const NOW = Date.parse("2026-10-25T03:20:40Z");

const appointment: SurveyAppointment = {
  id: "A1",
  version: 1,
  status: "SCHEDULED",
  startAt: "2026-10-25T03:00:00Z",
  surveyorUserId: "U1",
  holders: [{ userId: "U1", name: "Sale One", from: "2026-10-24T01:00:00Z", to: null }],
};

describe("visitDefaults (spec 6.2)", () => {
  it("arrives now (whole minute, Vietnam time) and the surveyor records their own visit", () => {
    expect(visitDefaults(NOW, "U1", appointment)).toEqual({
      arrivedAt: "2026-10-25T10:20",
      note: "",
      performerId: "U1",
      proxyReason: "",
      basisDate: "",
      basisText: "",
    });
  });

  it("names the current surveyor as the performer for anyone else", () => {
    expect(visitDefaults(NOW, "U9", appointment).performerId).toBe("U1");
  });
});

const form = (extra: Partial<VisitForm> = {}): VisitForm => ({
  ...visitDefaults(NOW, "U1", appointment),
  note: "Met the owner",
  ...extra,
});

describe("toVisitBody (spec 7.1)", () => {
  it("sends an own record without proxy", () => {
    expect(toVisitBody(form({ note: " Met the owner " }), "own", { leadVersion: 4, appointment })).toEqual({
      expectedLeadVersion: 4,
      expectedAppointmentVersion: 1,
      arrivedAt: "2026-10-25T03:20:00.000Z",
      note: "Met the owner",
      performedByUserId: "U1",
    });
  });

  it("sends a proxy record with reason and basis", () => {
    const body = toVisitBody(
      form({ proxyReason: " Sale had no signal ", basisDate: "2026-10-25", basisText: " Sale called me " }),
      "proxy",
      { leadVersion: 4, appointment },
    );
    expect(body.proxy).toEqual({ reason: "Sale had no signal", basis: { confirmedOn: "2026-10-25", text: "Sale called me" } });
  });
});

describe("validateVisit (US-3, BR-9, A-14, A-25)", () => {
  const own = { mode: "own" as const, canProxy: false, now: NOW };
  const proxy = { mode: "proxy" as const, canProxy: true, now: NOW };

  it("accepts an own record", () => {
    expect(validateVisit(form(), own)).toEqual({});
  });

  it("asks for the arrival, never in the future", () => {
    expect(validateVisit(form({ arrivedAt: "" }), own).arrivedAt).toBe("required");
    expect(validateVisit(form({ arrivedAt: "2026-10-25T10:21" }), own).arrivedAt).toBe("tooLate");
    expect(validateVisit(form({ arrivedAt: "2026-10-25T10:20" }), own).arrivedAt).toBeUndefined();
  });

  it("asks for a note of up to 2000 characters without a phone number", () => {
    expect(validateVisit(form({ note: " " }), own).note).toBe("required");
    expect(validateVisit(form({ note: "a".repeat(2001) }), own).note).toBe("tooLong");
    expect(validateVisit(form({ note: "a".repeat(2000) }), own).note).toBeUndefined();
    expect(validateVisit(form({ note: "Owner: 0905 123 456" }), own).note).toBe("phone");
  });

  it("asks for reason and basis on a proxy record", () => {
    const problems = validateVisit(form(), proxy);
    expect(problems).toEqual({ proxyReason: "required", basisDate: "required", basisText: "required" });
  });

  it("dates the basis from the arrival day to today (A-25)", () => {
    const base = { proxyReason: "No signal", basisText: "Sale called me" };
    expect(validateVisit(form({ ...base, basisDate: "2026-10-24" }), proxy).basisDate).toBe("tooEarly");
    expect(validateVisit(form({ ...base, basisDate: "2026-10-26" }), proxy).basisDate).toBe("tooLate");
    expect(validateVisit(form({ ...base, basisDate: "2026-10-25" }), proxy)).toEqual({});
    expect(validateVisit(form({ ...base, basisDate: "25/10/2026" }), proxy).basisDate).toBe("invalid");
  });

  it("refuses phone numbers in the proxy texts", () => {
    const problems = validateVisit(
      form({ proxyReason: "0905 123 456", basisDate: "2026-10-25", basisText: "+84905123456" }),
      proxy,
    );
    expect(problems).toEqual({ proxyReason: "phone", basisText: "phone" });
  });

  it("refuses a proxy record for someone who may not make one (a SALE)", () => {
    expect(validateVisit(form(), { ...proxy, canProxy: false }).performerId).toBe("notAllowed");
  });
});
