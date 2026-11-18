import { describe, expect, it } from "vitest";

import type { BrokerageAgreementAdvertising } from "../types";

import { advertisingModel } from "./advertising-model";

const ALLOWED: BrokerageAgreementAdvertising = {
  allowed: true,
  reasonGroups: [],
  endDate: "2027-12-31",
  endsAt: "2027-12-31T17:00:00Z",
  photoConsent: { interior: true, exterior: true },
  termsInEffect: null,
  pendingVersion: null,
};

describe("advertisingModel (brokerage-agreement E05-S6, S6-D7, S6-D8, UF-3)", () => {
  it("advertisingModel_allowed_endDateAndPhotoLine: an allowed answer names the end date and the photos that may be public, interior first", () => {
    expect(advertisingModel(ALLOWED)).toEqual({
      allowed: true,
      line: { key: "advertising.allowed", values: { date: "31 Dec 2027" } },
      photos: { key: "advertising.photos.interiorAndExterior" },
    });
    expect(advertisingModel({ ...ALLOWED, photoConsent: { interior: true, exterior: false } })).toMatchObject({
      photos: { key: "advertising.photos.interior" },
    });
    expect(advertisingModel({ ...ALLOWED, photoConsent: { interior: true } })).toMatchObject({
      photos: { key: "advertising.photos.interior" },
    });
    for (const photoConsent of [{ interior: false, exterior: false }, { interior: false, exterior: true }, { exterior: true }, {}]) {
      expect(advertisingModel({ ...ALLOWED, photoConsent })).toMatchObject({ photos: { key: "advertising.photos.none" } });
    }
    expect(advertisingModel({ ...ALLOWED, photoConsent: undefined })).toMatchObject({ photos: { key: "advertising.photos.none" } });
    expect(advertisingModel({ ...ALLOWED, endDate: null })).toMatchObject({ line: { key: "advertising.allowedNoEnd" } });
    expect(advertisingModel({ ...ALLOWED, endDate: undefined })).toMatchObject({ line: { key: "advertising.allowedNoEnd" } });
  });

  it("advertisingModel_groups_oneLinePerGroupInOrder: a refused answer gives one line per group, in the answer's order", () => {
    expect(
      advertisingModel({
        allowed: false,
        reasonGroups: ["NOT_STARTED"],
        pendingVersion: { startDate: "2027-01-01", startsAt: "2026-12-31T17:00:00Z" },
      }),
    ).toEqual({ allowed: false, lines: [{ key: "advertising.reasons.NOT_STARTED", values: { date: "1 Jan 2027" } }] });
    expect(advertisingModel({ allowed: false, reasonGroups: ["SUSPENDED", "PROPERTY", "OWNER"] })).toEqual({
      allowed: false,
      lines: [{ key: "advertising.reasons.SUSPENDED" }, { key: "eligibility.reasons.PROPERTY" }, { key: "eligibility.reasons.OWNER" }],
    });
  });

  it("advertisingModel_absentAllowedOrNoGroup_anotherReason: an answer without allowed, or not allowed with no group, reads another reason and never allowed", () => {
    const answers: BrokerageAgreementAdvertising[] = [{}, { allowed: false }, { allowed: false, reasonGroups: [] }, { reasonGroups: [] }];
    for (const answer of answers) {
      expect(advertisingModel(answer)).toEqual({ allowed: false, lines: [{ key: "eligibility.reasons.OTHER" }] });
    }
  });
});
