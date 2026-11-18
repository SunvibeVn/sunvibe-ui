import { afterEach, describe, expect, it, vi } from "vitest";

import type { BrokerageAgreementAdvertising } from "../types";

import { advertisingReasonText } from "./advertising-text";

const NOT_STARTED: BrokerageAgreementAdvertising = {
  allowed: false,
  reasonGroups: ["NOT_STARTED"],
  endDate: "2027-12-31",
  endsAt: "2027-12-31T17:00:00Z",
  photoConsent: { interior: false, exterior: false },
  termsInEffect: null,
  pendingVersion: { startDate: "2027-01-01", startsAt: "2026-12-31T17:00:00Z" },
};

describe("advertisingReasonText (brokerage-agreement E05-S6, S6-D7, S6-D20, spec section 6)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("advertisingText_notStarted_calendarDateWithoutZoneShift: NOT_STARTED names the pending version's start as its calendar date, never a day earlier west of UTC; without a start date the undated line", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    // The zone took: midnight of 1 Jan 2027 here is behind UTC.
    expect(new Date(2027, 0, 1).getTimezoneOffset()).toBeGreaterThan(0);

    expect(advertisingReasonText("NOT_STARTED", NOT_STARTED)).toEqual({
      key: "advertising.reasons.NOT_STARTED",
      values: { date: "1 Jan 2027" },
    });
    expect(advertisingReasonText("NOT_STARTED", { ...NOT_STARTED, pendingVersion: null })).toEqual({
      key: "advertising.notStartedUndated",
    });
    expect(advertisingReasonText("NOT_STARTED", { ...NOT_STARTED, pendingVersion: {} })).toEqual({
      key: "advertising.notStartedUndated",
    });
  });

  it("advertisingText_ended_periodEndedOnItsDate: ENDED names the end date when known (an agreement still stored Active past its end, S6-D20), else the plain line; condition groups read E05-S1's lines", () => {
    const ended: BrokerageAgreementAdvertising = { allowed: false, reasonGroups: ["ENDED"], endDate: "2027-12-31" };

    expect(advertisingReasonText("ENDED", ended)).toEqual({ key: "advertising.endedOn", values: { date: "31 Dec 2027" } });
    expect(advertisingReasonText("ENDED", { ...ended, endDate: null })).toEqual({ key: "advertising.reasons.ENDED" });
    expect(advertisingReasonText("ENDED", { allowed: false })).toEqual({ key: "advertising.reasons.ENDED" });
    expect(advertisingReasonText("BASIS", ended)).toEqual({ key: "eligibility.reasons.BASIS" });
    expect(advertisingReasonText("NEW_GROUP", ended)).toEqual({ key: "eligibility.reasons.OTHER" });
  });

  it("advertisingText_agreementGroups_theirLines: NO_AGREEMENT, NOT_IN_EFFECT and SUSPENDED each read their own line; PROPERTY, UNIT and OWNER read E05-S1's", () => {
    const answer: BrokerageAgreementAdvertising = { allowed: false };
    expect(
      ["NO_AGREEMENT", "NOT_IN_EFFECT", "SUSPENDED", "PROPERTY", "UNIT", "OWNER"].map((group) =>
        advertisingReasonText(group, answer),
      ),
    ).toEqual([
      { key: "advertising.reasons.NO_AGREEMENT" },
      { key: "advertising.reasons.NOT_IN_EFFECT" },
      { key: "advertising.reasons.SUSPENDED" },
      { key: "eligibility.reasons.PROPERTY" },
      { key: "eligibility.reasons.UNIT" },
      { key: "eligibility.reasons.OWNER" },
    ]);
  });
});
