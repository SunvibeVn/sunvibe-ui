import type { ApiResult } from "@/features/auth/client";

import { reviewDecisionSchema } from "../schemas/review-decision.schema";
import type { decideListingRevision } from "../services/review-api";
import type { ListingRevisionChange } from "../types";

import { type FieldErrors, type FormState, fieldErrorsOf, initialFormState, invalidState, successState } from "./form-state";
import { type DecisionFormValues, requestBody } from "./review-decision-form";
import { ineligibilityKey } from "./review-text";
import type { ListingKey } from "./revision-text";

/** The refusals of a decision, each with its one sentence (spec section 6, E06S4-P13). */
export type ReviewDecisionAnswer =
  | "decisionIncomplete"
  | "noteInvalid"
  | "invalid"
  | "forbidden"
  | "notIndependent"
  | "notFound"
  | "concurrent"
  | "termsMismatch"
  | "notPending"
  | "archived"
  | "failed";

/**
 * A decision's outcome: `decided`; `invalid` when the schema refuses the values and nothing is sent; `refused` with its
 * sentence; `reread` for a 403 `REVIEWER_NOT_INDEPENDENT` and every 409, after which the page reads the review and the
 * revision again in place; `silent` for a session answer, which shows nothing (E06S1-P8).
 */
export type ReviewDecisionOutcome =
  | { kind: "decided" }
  | { kind: "invalid"; fieldErrors: FieldErrors }
  | { kind: "refused"; answer: ReviewDecisionAnswer; reasonKeys: ListingKey[] }
  | { kind: "reread"; answer: ReviewDecisionAnswer; reasonKeys: ListingKey[] }
  | { kind: "silent" };

/** The form's state: the sentence of an answer, the reasons of a 403 `REVIEWER_NOT_INDEPENDENT`, or the fields' problems. */
export type DecisionFormState = FormState & { reasonKeys?: ListingKey[] };

export type ReviewDecisionInput = { listingId: string; revisionNo: number; values: DecisionFormValues; dataVersion: number };

export type ReviewDecisionFlowDeps = { decide: typeof decideListingRevision };

export const DECISION_ANSWER_KEYS: Record<ReviewDecisionAnswer, ListingKey> = {
  decisionIncomplete: "review.decision.answers.decisionIncomplete",
  noteInvalid: "review.decision.answers.noteInvalid",
  invalid: "review.decision.answers.invalid",
  forbidden: "review.decision.answers.forbidden",
  notIndependent: "review.decision.answers.notIndependent",
  notFound: "review.decision.answers.notFound",
  concurrent: "review.decision.answers.concurrent",
  termsMismatch: "review.decision.answers.termsMismatch",
  notPending: "review.decision.answers.notPending",
  archived: "review.decision.answers.archived",
  failed: "review.decision.answers.failed",
};

const REREAD_409: Readonly<Record<string, ReviewDecisionAnswer>> = {
  CONCURRENT_MODIFICATION: "concurrent",
  REVISION_TERMS_MISMATCH: "termsMismatch",
  REVISION_NOT_PENDING: "notPending",
  LISTING_ARCHIVED: "archived",
};

/** A 400's sentence by its entries (E06S4-D6): the cross-field rule first, then the note, else the body itself. */
function invalidAnswer(fields: readonly string[]): ReviewDecisionAnswer {
  if (fields.includes("decisionMatchesOutcome")) return "decisionIncomplete";
  if (fields.includes("note")) return "noteInvalid";
  return "invalid";
}

/** The answer of a refused decision, mapped by status and code, never by its text. */
function outcomeOfRefusal(result: Exclude<ApiResult<ListingRevisionChange>, { ok: true }>): ReviewDecisionOutcome {
  if (result.kind === "signed-out" || result.kind === "unavailable") return { kind: "silent" };
  if (result.kind === "network") return { kind: "refused", answer: "failed", reasonKeys: [] };
  const fields = result.fieldErrors.map((entry) => entry.field);
  if (result.status === 400) return { kind: "refused", answer: invalidAnswer(fields), reasonKeys: [] };
  if (result.status === 403 && result.code === "REVIEWER_NOT_INDEPENDENT") {
    const reasonKeys = fields.filter((field) => field.startsWith("reasons.")).map((field) => ineligibilityKey(field.slice("reasons.".length)));
    return { kind: "reread", answer: "notIndependent", reasonKeys };
  }
  if (result.status === 403) return { kind: "refused", answer: "forbidden", reasonKeys: [] };
  if (result.status === 404) return { kind: "refused", answer: "notFound", reasonKeys: [] };
  if (result.status === 409) {
    const code = result.code ?? "";
    const answer = Object.hasOwn(REREAD_409, code) ? (REREAD_409[code] as ReviewDecisionAnswer) : "failed";
    return { kind: "reread", answer, reasonKeys: [] };
  }
  return { kind: "refused", answer: "failed", reasonKeys: [] };
}

/**
 * Sends one decision (listing-publish US-4 AC-3 to AC-5, E06S4-D5, D6): the values are checked with the form's schema
 * first and nothing is sent when it refuses them; else one POST with the chosen outcome's fields and the listing's data
 * version the page read. The server decides the decision, its shape, the reviewer's independence and the terms.
 */
export async function runReviewDecision(input: ReviewDecisionInput, deps: ReviewDecisionFlowDeps): Promise<ReviewDecisionOutcome> {
  const parsed = reviewDecisionSchema.safeParse(input.values);
  if (!parsed.success) return { kind: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  const result = await deps.decide(input.listingId, input.revisionNo, requestBody(parsed.data, input.dataVersion));
  if (result.ok) return { kind: "decided" };
  return outcomeOfRefusal(result);
}

/** The form's state after an outcome: success, the fields' problems, or the answer's sentence with its reasons. */
export function decisionFormStateOf(outcome: ReviewDecisionOutcome): DecisionFormState {
  switch (outcome.kind) {
    case "decided":
      return successState();
    case "invalid":
      return invalidState(outcome.fieldErrors);
    case "silent":
      return initialFormState;
    case "refused":
    case "reread":
      return {
        status: "error",
        messageKey: DECISION_ANSWER_KEYS[outcome.answer],
        ...(outcome.reasonKeys.length > 0 ? { reasonKeys: outcome.reasonKeys } : {}),
      };
  }
}
