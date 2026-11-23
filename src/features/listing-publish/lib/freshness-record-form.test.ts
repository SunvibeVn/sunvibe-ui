import { describe, expect, it } from "vitest";

import { type FreshnessFormValues, hintKeys, isComplete, noteCount, requestBody } from "./freshness-record-form";

/** A complete contact: a phone call, still available, both answers yes. */
const COMPLETE: FreshnessFormValues = { channel: "CALL", outcome: "AVAILABLE", termsStillApply: true, unitUnchanged: true, note: "" };

describe("freshness record form (listing-publish E06-S3, spec section 6, E06S3-D11, P13 (5))", () => {
  it("freshnessForm_available_completeOnlyWithBothAnswers: still available is complete only with both answers", () => {
    expect(isComplete(COMPLETE)).toBe(true);
    expect([isComplete({ ...COMPLETE, termsStillApply: null }), isComplete({ ...COMPLETE, unitUnchanged: null })]).toEqual([
      false,
      false,
    ]);
  });

  it("freshnessForm_otherOutcome_bodyOmitsAnswers: the body of another result carries no answer, whatever the form held", () => {
    expect(
      (["NOT_AVAILABLE", "UNREACHABLE"] as const).map((outcome) =>
        requestBody({ channel: "MESSAGE", outcome, termsStillApply: true, unitUnchanged: false, note: "" }, 7),
      ),
    ).toEqual([
      { dataVersion: 7, channel: "MESSAGE", outcome: "NOT_AVAILABLE", termsStillApply: null, unitUnchanged: null, note: null },
      { dataVersion: 7, channel: "MESSAGE", outcome: "UNREACHABLE", termsStillApply: null, unitUnchanged: null, note: null },
    ]);
  });

  it("freshnessForm_hints_byOutcomeAndAnswers: each result shows its hint of E06S3-D11; both answers yes show none (FR-15)", () => {
    expect(
      [
        { ...COMPLETE, outcome: "UNREACHABLE" as const, termsStillApply: null, unitUnchanged: null },
        { ...COMPLETE, outcome: "NOT_AVAILABLE" as const, termsStillApply: null, unitUnchanged: null },
        { ...COMPLETE, termsStillApply: false },
        { ...COMPLETE, unitUnchanged: false },
      ].map(hintKeys),
    ).toEqual([
      ["freshness.form.hintUnreachable"],
      ["freshness.form.hintNotAvailable", "freshness.prompt"],
      ["freshness.form.hintNotValid"],
      ["freshness.form.hintNotValid"],
    ]);
    expect(hintKeys(COMPLETE)).toEqual([]);
  });

  it("freshnessForm_noteCount_codePointsOfNfc: the counter counts code points of the NFC text", () => {
    expect([noteCount("😀".repeat(500)), noteCount("é")]).toEqual([500, 1]);
  });
});
