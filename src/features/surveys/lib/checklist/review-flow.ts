import type { ApiResult } from "@/features/auth/client";

import type { ChecklistDecided, ChecklistSubmitted, ChecklistView } from "../../types";
import { type ChecklistUiError, toChecklistUiError } from "../checklist-ui-error";
import { type DecisionResult, mayHaveCommitted } from "./review-model";
import { submitFailureStep } from "./submission-model";

// The two commands that freeze or decide a revision (survey-checklist submission spec 6.1, 9.5), as flows with injected
// calls: the sequence of send, read and what stands is the part a test must run.

type PageParts = {
  /** Takes the revision of a 200 onto the screen. */
  apply(view: ChecklistView): void;
  /** The refusals the page answers itself: 403, 404, the session, read-only. */
  pageFailure(error: ChecklistUiError): Promise<unknown>;
};

export type DecisionDeps = PageParts & {
  send(): Promise<ApiResult<ChecklistDecided>>;
  /** Reads the checklist: what the server says now, or null when the read failed. */
  read(): Promise<ChecklistView | null>;
};

/**
 * Sends a decision. It commits before its answer is built (spec 9.5): after a 5xx, a lost answer or a 409 the read comes
 * first, and a decision standing, the reviewer's or another's, answers instead of an error. Without a read nobody knows.
 */
export async function runDecision({ send, apply, read, pageFailure }: DecisionDeps): Promise<DecisionResult> {
  const result = await send();
  const error = toChecklistUiError(result);
  if (error === null && result.ok && result.data.checklist) {
    apply(result.data.checklist);
    return { kind: "decided" };
  }
  const failure: ChecklistUiError = error ?? { kind: "retry" };
  if (!mayHaveCommitted(failure)) {
    await pageFailure(failure);
    return { kind: "failed", error: failure };
  }
  const seen = await read();
  if (seen === null) return { kind: "unknown", error: failure };
  if (!seen.decision) return { kind: "failed", error: failure };
  // A newer read may own the screen and fail: the decision reaches it from this answer.
  apply(seen);
  return { kind: "already-decided" };
}

export type SubmitDeps = PageParts & {
  send(): Promise<ApiResult<ChecklistSubmitted>>;
  read(): Promise<unknown>;
};

export type SubmitResult = { kind: "saved" } | { kind: "failed"; error: ChecklistUiError };

/** Submits a revision. A repeat by the same caller answers 200 and is a success too, so a retry is safe (A-4). */
export async function runSubmit({ send, apply, read, pageFailure }: SubmitDeps): Promise<SubmitResult> {
  const result = await send();
  const error = toChecklistUiError(result);
  if (error === null && result.ok && result.data.checklist) {
    apply(result.data.checklist);
    return { kind: "saved" };
  }
  const failure: ChecklistUiError = error ?? { kind: "retry" };
  const step = submitFailureStep(failure);
  if (step.kind === "page") await pageFailure(failure);
  else if (step.reload) await read();
  return { kind: "failed", error: failure };
}
