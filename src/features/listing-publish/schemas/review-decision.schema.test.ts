import { describe, expect, it } from "vitest";

import { EMPTY_DECISION_FORM, type DecisionFormValues } from "../lib/review-decision-form";

import { reviewDecisionSchema } from "./review-decision.schema";

const RETURN: DecisionFormValues = { ...EMPTY_DECISION_FORM, outcome: "NEEDS_CHANGES", changeReasons: ["MISSING_INFORMATION"], note: "Thiếu diện tích." };

/** The fields the schema refuses, by the first segment of each issue's path, with each issue's problem code. */
function problems(values: DecisionFormValues): Record<string, string> {
  const result = reviewDecisionSchema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

describe("review decision schema (listing-publish E06-S4, E06S4-D6, E06S4-P10)", () => {
  it("reviewDecisionSchema_note_edgeAndCounterBounds: 1,000 code points after the counter's normalization pass and 1,001 fail; over 4,000 UTF-16 units fails before; CR LF counts as one", () => {
    const emoji = "😀";
    expect(problems({ ...RETURN, note: emoji.repeat(1000) })).toEqual({});
    expect(problems({ ...RETURN, note: emoji.repeat(1001) })).toEqual({ note: "noteTooLong" });
    // 4,001 UTF-16 units of which only 1,000 code points stay after trimming: the edge bound refuses it.
    expect(problems({ ...RETURN, note: `${" ".repeat(3001)}${"a".repeat(1000)}` })).toEqual({ note: "noteTooLong" });
    expect(problems({ ...RETURN, note: `${" ".repeat(3000)}${"a".repeat(1000)}` })).toEqual({});
    // CR LF is one line feed, the ends are trimmed, and a letter with a combining accent is one character.
    expect(problems({ ...RETURN, note: `${"a".repeat(998)}\r\nb` })).toEqual({});
    expect(problems({ ...RETURN, note: `${"é".repeat(1000)}  \n` })).toEqual({});
    expect(problems({ ...RETURN, note: `${"a".repeat(999)}\r\nb` })).toEqual({ note: "noteTooLong" });
  });

  it("reviewDecisionSchema_codes_closedListsAndMaxFive: the outcome, the checks, the reasons and the group are the contract's closed lists, each list at most five; the shape that only the server checks passes", () => {
    expect(problems({ ...RETURN, outcome: null })).toEqual({ outcome: "outcome" });
    expect(problems({ ...RETURN, outcome: "PUBLISHED" as never })).toEqual({ outcome: "outcome" });
    expect(problems({ ...RETURN, checks: ["CONTENT_MATCHES_UNIT", "PHOTOS_OK"] })).toEqual({ checks: "checks" });
    expect(
      problems({
        ...RETURN,
        outcome: "APPROVED",
        checks: ["CONTENT_MATCHES_UNIT", "TEXT_FOLLOWS_RULES", "TERMS_MATCH_AGREEMENT", "NO_FRAUD_SIGNS", "AGREEMENT_END_AND_RIGHT", "NO_FRAUD_SIGNS"],
      }),
    ).toEqual({ checks: "checks" });
    expect(problems({ ...RETURN, changeReasons: ["PHOTO_NOT_ACCEPTED"] })).toEqual({ changeReasons: "changeReasons" });
    expect(
      problems({ ...RETURN, changeReasons: ["CONTENT_MISMATCH", "TEXT_RULE_VIOLATION", "MISSING_INFORMATION", "TERMS_MISMATCH", "OTHER", "OTHER"] }),
    ).toEqual({ changeReasons: "changeReasons" });
    expect(problems({ ...RETURN, outcome: "REJECTED", rejectionGroup: "SPAM" })).toEqual({ rejectionGroup: "rejectionGroup" });

    // What only the server checks (decisionMatchesOutcome, E06S4-P10) and the control characters pass here.
    expect(problems({ ...RETURN, changeReasons: [], note: "" })).toEqual({});
    expect(problems({ ...RETURN, outcome: "APPROVED", checks: [], note: "a note" })).toEqual({});
    expect(problems({ ...RETURN, outcome: "REJECTED", rejectionGroup: null })).toEqual({});
    expect(problems({ ...RETURN, note: "bell \u0007" })).toEqual({});
    expect(problems({ ...RETURN, outcome: "REJECTED", rejectionGroup: "WRONG_UNIT" })).toEqual({});
  });
});
