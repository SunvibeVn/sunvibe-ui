import { normalizedNote } from "../schemas/freshness-record.schema";
import type { ListingRevisionDecisionRequest } from "../types";

type Outcome = ListingRevisionDecisionRequest["outcome"];
type Body = ListingRevisionDecisionRequest;

/**
 * What a reviewer chose and typed (spec section 6, E06S4-D6). The page holds these values, so a re-read in place keeps
 * them exactly while the reader may still decide; each outcome's own fields stay while another outcome is chosen, and
 * only the chosen outcome's fields are sent.
 */
export type DecisionFormValues = {
  outcome: Outcome | null;
  checks: string[];
  changeReasons: string[];
  rejectionGroup: string | null;
  note: string;
};

export const EMPTY_DECISION_FORM: DecisionFormValues = { outcome: null, checks: [], changeReasons: [], rejectionGroup: null, note: "" };

/**
 * Approve is sent only with every item of the checklist ticked and terms that equal a version of the agreement
 * (spec section 6): a revision whose terms equal no version cannot be approved (E06S4-D7). The server decides again.
 */
export function mayApprove(values: DecisionFormValues, checklist: readonly string[], termsMatch: string): boolean {
  return checklist.length > 0 && checklist.every((code) => values.checks.includes(code)) && termsMatch !== "NONE";
}

/** The note's counter: code points of the note as the server stores it (NFC, CR LF and CR as LF, trimmed). */
export function noteCount(note: string): number {
  const normalized = normalizedNote(note);
  return normalized === null ? 0 : [...normalized].length;
}

/**
 * The body of a decision (E06S4-P10): the data version the page read, the outcome and only its own fields: the checks
 * for Approve, the reasons and the note for a return, the group and the note for a rejection. What the reviewer left
 * out is sent as it is, and the server answers `decisionMatchesOutcome`.
 */
export function requestBody(values: DecisionFormValues & { outcome: Outcome }, dataVersion: number): Body {
  switch (values.outcome) {
    case "APPROVED":
      return { dataVersion, outcome: "APPROVED", checks: values.checks as NonNullable<Body["checks"]> };
    case "NEEDS_CHANGES":
      return { dataVersion, outcome: "NEEDS_CHANGES", changeReasons: values.changeReasons as NonNullable<Body["changeReasons"]>, note: values.note };
    case "REJECTED":
      return { dataVersion, outcome: "REJECTED", rejectionGroup: values.rejectionGroup as Body["rejectionGroup"], note: values.note };
  }
}
