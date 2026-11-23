import { z } from "zod";

import { normalizedNote } from "./freshness-record.schema";

// A reviewer's decision (listing-publish US-4 AC-3, E06S4-D6), as ListingRevisionDecisionRequest checks its fields
// (E06S4-P10): the closed lists, at most five checks and five reasons, and the note's two bounds. It holds neither the
// cross-field rule `decisionMatchesOutcome` nor the refusal of control characters: the server answers both, and the
// form shows their sentences. Each issue's message is the problem of its field.

/** The edge bound of the note in UTF-16 units, checked before it is normalized (`@Size`, E06S4-A-2). */
export const DECISION_NOTE_EDGE_UNITS = 4000;
/** The note's bound in code points after normalization (NFC, CR LF and CR as LF, trimmed; E06S4-D6). */
export const DECISION_NOTE_MAX_CODE_POINTS = 1000;
/** At most five elements in each list, checked first by the server (E06S4-D6, list bounds). */
export const DECISION_LIST_MAX = 5;

export const OUTCOMES = ["APPROVED", "NEEDS_CHANGES", "REJECTED"] as const;
export const CHECKS = ["CONTENT_MATCHES_UNIT", "TEXT_FOLLOWS_RULES", "TERMS_MATCH_AGREEMENT", "NO_FRAUD_SIGNS", "AGREEMENT_END_AND_RIGHT"] as const;
export const CHANGE_REASONS = ["CONTENT_MISMATCH", "TEXT_RULE_VIOLATION", "MISSING_INFORMATION", "TERMS_MISMATCH", "OTHER"] as const;
export const REJECTION_GROUPS = ["SUSPECTED_FRAUD", "WRONG_UNIT", "SERIOUS_VIOLATION", "OTHER"] as const;

const note = z.string().superRefine((value, context) => {
  if (value.length > DECISION_NOTE_EDGE_UNITS) {
    context.addIssue({ code: "custom", message: "noteTooLong" });
    return;
  }
  const normalized = normalizedNote(value);
  if (normalized !== null && [...normalized].length > DECISION_NOTE_MAX_CODE_POINTS) {
    context.addIssue({ code: "custom", message: "noteTooLong" });
  }
});

export const reviewDecisionSchema = z.object({
  outcome: z.enum(OUTCOMES, { error: "outcome" }),
  checks: z.array(z.enum(CHECKS, { error: "checks" })).max(DECISION_LIST_MAX, { error: "checks" }),
  changeReasons: z.array(z.enum(CHANGE_REASONS, { error: "changeReasons" })).max(DECISION_LIST_MAX, { error: "changeReasons" }),
  rejectionGroup: z.enum(REJECTION_GROUPS, { error: "rejectionGroup" }).nullable(),
  note,
});

export type ReviewDecisionInput = z.output<typeof reviewDecisionSchema>;
