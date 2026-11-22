import { describe, expect, it } from "vitest";

import { type DecisionFormValues, EMPTY_DECISION_FORM, mayApprove, noteCount, requestBody } from "./review-decision-form";

const CHECKLIST = ["CONTENT_MATCHES_UNIT", "TEXT_FOLLOWS_RULES", "TERMS_MATCH_AGREEMENT", "NO_FRAUD_SIGNS", "AGREEMENT_END_AND_RIGHT"];

/** Every field filled, so the body shows which ones it leaves out. */
const FILLED: DecisionFormValues = {
  outcome: "APPROVED",
  checks: [...CHECKLIST],
  changeReasons: ["MISSING_INFORMATION", "OTHER"],
  rejectionGroup: "WRONG_UNIT",
  note: "Thiếu diện tích.",
};

describe("review decision form (listing-publish E06-S4, spec section 6, E06S4-D6, E06S4-P10)", () => {
  it("reviewDecisionForm_mayApprove_allChecksAndTermsMatch: Approve only with every checklist item ticked and terms that equal a version", () => {
    expect(mayApprove(FILLED, CHECKLIST, "IN_EFFECT")).toBe(true);
    expect(mayApprove(FILLED, CHECKLIST, "PENDING_START")).toBe(true);
    expect(mayApprove({ ...FILLED, checks: [...CHECKLIST].reverse() }, CHECKLIST, "IN_EFFECT")).toBe(true);
    expect(mayApprove({ ...FILLED, checks: CHECKLIST.slice(0, 4) }, CHECKLIST, "IN_EFFECT")).toBe(false);
    expect(mayApprove({ ...FILLED, checks: [] }, CHECKLIST, "IN_EFFECT")).toBe(false);
    expect(mayApprove(FILLED, CHECKLIST, "NONE")).toBe(false);
    expect(mayApprove(EMPTY_DECISION_FORM, CHECKLIST, "IN_EFFECT")).toBe(false);
  });

  it("reviewDecisionForm_requestBody_onlyChosenOutcomeFields: the body carries the data version, the outcome and only the chosen outcome's fields", () => {
    expect(requestBody({ ...FILLED, outcome: "APPROVED" }, 9)).toStrictEqual({ dataVersion: 9, outcome: "APPROVED", checks: CHECKLIST });
    expect(requestBody({ ...FILLED, outcome: "NEEDS_CHANGES" }, 9)).toStrictEqual({
      dataVersion: 9,
      outcome: "NEEDS_CHANGES",
      changeReasons: ["MISSING_INFORMATION", "OTHER"],
      note: "Thiếu diện tích.",
    });
    expect(requestBody({ ...FILLED, outcome: "REJECTED" }, 9)).toStrictEqual({
      dataVersion: 9,
      outcome: "REJECTED",
      rejectionGroup: "WRONG_UNIT",
      note: "Thiếu diện tích.",
    });
    // What the reviewer left out is sent as it is; the server answers decisionMatchesOutcome (E06S4-P10).
    expect(requestBody({ ...EMPTY_DECISION_FORM, outcome: "REJECTED" }, 3)).toStrictEqual({
      dataVersion: 3,
      outcome: "REJECTED",
      rejectionGroup: null,
      note: "",
    });
  });

  it("reviewDecisionForm_noteCount_codePointsOfNfc: the counter counts code points of the note as stored: NFC, CR LF as one line feed, the ends trimmed", () => {
    expect(noteCount("")).toBe(0);
    expect(noteCount("é")).toBe(1);
    expect(noteCount("😀😀")).toBe(2);
    expect(noteCount("a\r\nb")).toBe(3);
    expect(noteCount("  a  \n")).toBe(1);
    expect(noteCount("Thiếu diện tích.")).toBe(16);
  });
});
