import { describe, expect, it } from "vitest";

import type { SurveyAppointment } from "@/features/surveys";

import { type ChangeForm, changeDefaults, changeIsEmpty, changeRemovesConfirmation, toChangeBody, validateChange } from "./change-form";

const PLACE = { addressText: "25 Trần Phú", wardCode: "20242", latitude: 16.0715, longitude: 108.2239 };
/** 2026-10-23 09:00 in Vietnam. */
const NOW = Date.parse("2026-10-23T02:00:00Z");

const appointment: SurveyAppointment = {
  id: "A1",
  version: 3,
  status: "SCHEDULED",
  startAt: "2026-10-25T03:00:00Z",
  durationMinutes: 60,
  meetingLocation: { ...PLACE, provinceCode: "48", provinceName: "Đà Nẵng", wardName: "Hải Châu" },
  accessNote: "Gate on the left",
  onSiteContactName: null,
  onSiteContactRole: null,
};

const form = (extra: Partial<ChangeForm> = {}): ChangeForm => ({ ...changeDefaults(appointment), ...extra });

describe("changeDefaults (spec 6.2)", () => {
  it("shows the current values in Vietnam time, with an empty reason", () => {
    expect(changeDefaults(appointment)).toEqual({
      start: "2026-10-25T10:00",
      duration: "60",
      place: PLACE,
      accessNote: "Gate on the left",
      onSiteContactName: "",
      onSiteContactRole: "",
      reason: "",
    });
  });
});

describe("toChangeBody (A-4: every key present)", () => {
  it("sends every key, unchanged values included, and null for a blank optional text", () => {
    const body = toChangeBody(form({ reason: " Owner asked for later ", start: "2026-10-25T12:00", accessNote: " " }), appointment, 7);
    expect(body).toEqual({
      expectedLeadVersion: 7,
      expectedAppointmentVersion: 3,
      reason: "Owner asked for later",
      startAt: "2026-10-25T05:00:00.000Z",
      durationMinutes: 60,
      meetingLocation: { addressText: "25 Trần Phú", provinceCode: "48", wardCode: "20242", latitude: 16.0715, longitude: 108.2239 },
      accessNote: null,
      onSiteContactName: null,
      onSiteContactRole: null,
    });
    expect(Object.keys(body).sort()).toEqual(
      [
        "accessNote",
        "durationMinutes",
        "expectedAppointmentVersion",
        "expectedLeadVersion",
        "meetingLocation",
        "onSiteContactName",
        "onSiteContactRole",
        "reason",
        "startAt",
      ].sort(),
    );
  });
});

describe("changeRemovesConfirmation and changeIsEmpty (A-28, A-4)", () => {
  it("says a new time or place removes the owner confirmation", () => {
    expect(changeRemovesConfirmation(form({ start: "2026-10-25T11:00" }), appointment)).toBe(true);
    expect(changeRemovesConfirmation(form({ duration: "90" }), appointment)).toBe(true);
    expect(changeRemovesConfirmation(form({ place: { ...PLACE, wardCode: "20257" } }), appointment)).toBe(true);
    expect(changeRemovesConfirmation(form({ accessNote: "New note" }), appointment)).toBe(false);
  });

  it("finds a form that changes nothing (Nothing changed.)", () => {
    expect(changeIsEmpty(form({ reason: "why" }), appointment)).toBe(true);
    expect(changeIsEmpty(form({ accessNote: " Gate on the left " }), appointment)).toBe(true);
    expect(changeIsEmpty(form({ onSiteContactName: "Lan" }), appointment)).toBe(false);
    expect(changeIsEmpty(form({ place: { ...PLACE, addressText: "25  trần phú" } }), appointment)).toBe(false);
  });
});

describe("validateChange (BR-4, A-14)", () => {
  const ctx = { now: NOW };

  it("asks for a reason without a phone number", () => {
    expect(validateChange(form(), appointment, ctx).reason).toBe("required");
    expect(validateChange(form({ reason: "Call 0905 123 456" }), appointment, ctx).reason).toBe("phone");
    expect(validateChange(form({ reason: "a".repeat(501) }), appointment, ctx).reason).toBe("tooLong");
    expect(validateChange(form({ reason: "Owner asked" }), appointment, ctx)).toEqual({});
  });

  it("checks the window only for a new start, so an overdue appointment can still change its note", () => {
    const later = { now: Date.parse("2026-10-26T02:00:00Z") };
    expect(validateChange(form({ reason: "r", accessNote: "x" }), appointment, later).start).toBeUndefined();
    expect(validateChange(form({ reason: "r", start: "2026-10-25T11:00" }), appointment, later).start).toBe("tooEarly");
  });

  it("checks the place and the optional texts as the booking does", () => {
    const base = { reason: "r" };
    expect(validateChange(form({ ...base, place: { ...PLACE, addressText: "" } }), appointment, ctx).address).toBe("required");
    expect(validateChange(form({ ...base, accessNote: "0905 123 456" }), appointment, ctx).accessNote).toBe("phone");
    expect(validateChange(form({ ...base, duration: "25" }), appointment, ctx).duration).toBe("invalid");
  });
});
