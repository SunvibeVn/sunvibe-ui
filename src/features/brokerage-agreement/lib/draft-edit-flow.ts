import type { ApiResult } from "@/features/auth/client";

import { updateDraft } from "../services/agreement-api";
import type { BrokerageAgreementDraftRequest } from "../types";

import { type DraftEditField, fieldOfServerPath } from "./draft-edit-form";
import { type EligibilityKey, reasonText } from "./reason-text";

/** What one save of the draft ended with, for the edit form (brokerage-agreement E05-S3, spec section 6). */
export type DraftEditOutcome =
  | { kind: "saved" }
  /** A 400 the client checks should have prevented: the form fields its entries name, and the support code. */
  | { kind: "invalid"; fields: DraftEditField[]; correlationId?: string }
  /** The draft's basis cannot hold an agreement now: one text per reason group, in the answer's order. */
  | { kind: "refused"; reason: "notEligible"; groupKeys: EligibilityKey[] }
  | { kind: "refused"; reason: "notDraft" | "stale" | "notAssignee" | "notFound" }
  | { kind: "failed"; correlationId?: string };

export type DraftEditFlowDeps = {
  updateDraft(agreementId: string, body: BrokerageAgreementDraftRequest): Promise<ApiResult<undefined>>;
};

const DEFAULT_DEPS: DraftEditFlowDeps = { updateDraft: (agreementId, body) => updateDraft(agreementId, body) };

const GROUP_PREFIX = "reasonGroups.";

/**
 * Saves the whole draft once and reads the answer by kind, status and `code`, never by message (spec section 4): 204 →
 * `saved`; 400 `VALIDATION_FAILED` → `invalid` with the fields; 409 `AGREEMENT_NOT_ELIGIBLE` → `notEligible` with the
 * group texts; 409 `AGREEMENT_NOT_DRAFT` → `notDraft`; 409 `CONCURRENT_MODIFICATION`, a stale data version or a lost
 * race alike → `stale`; 403 `AGREEMENT_NOT_ASSIGNEE` → `notAssignee`; 404 and 403 `FORBIDDEN` → `notFound`; any other
 * answer (400 `MALFORMED_REQUEST`, 500, no answer, no session) → `failed` with its support code.
 */
export async function saveDraft(
  agreementId: string,
  body: BrokerageAgreementDraftRequest,
  deps: DraftEditFlowDeps = DEFAULT_DEPS,
): Promise<DraftEditOutcome> {
  const result = await deps.updateDraft(agreementId, body);
  if (result.ok) return { kind: "saved" };
  if (result.kind !== "http") return { kind: "failed" };

  const { status, code, fieldErrors, correlationId } = result;
  if (status === 400 && code === "VALIDATION_FAILED") {
    const fields = [
      ...new Set(
        fieldErrors.map((entry) => fieldOfServerPath(entry.field)).filter((field): field is DraftEditField => field !== null),
      ),
    ];
    return correlationId === undefined ? { kind: "invalid", fields } : { kind: "invalid", fields, correlationId };
  }
  if (status === 409 && code === "AGREEMENT_NOT_ELIGIBLE") {
    const groupKeys = fieldErrors
      .filter((entry) => entry.field.startsWith(GROUP_PREFIX))
      .map((entry) => reasonText(entry.field.slice(GROUP_PREFIX.length)));
    return { kind: "refused", reason: "notEligible", groupKeys };
  }
  if (status === 409 && code === "AGREEMENT_NOT_DRAFT") return { kind: "refused", reason: "notDraft" };
  if (status === 409 && code === "CONCURRENT_MODIFICATION") return { kind: "refused", reason: "stale" };
  if (status === 403 && code === "AGREEMENT_NOT_ASSIGNEE") return { kind: "refused", reason: "notAssignee" };
  if (status === 404 || (status === 403 && code === "FORBIDDEN")) return { kind: "refused", reason: "notFound" };
  return correlationId === undefined ? { kind: "failed" } : { kind: "failed", correlationId };
}
