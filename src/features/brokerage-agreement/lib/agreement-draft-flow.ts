import type { ApiResult } from "@/features/auth/client";

import { createAgreement } from "../services/agreement-api";
import type { BrokerageAgreementCreated, BrokerageAgreementCreateRequest } from "../types";

import type { DraftField } from "./agreement-draft-form";
import { type EligibilityKey, reasonText } from "./reason-text";

/** What one draft submit ended with, for the dialog (brokerage-agreement E05-S2, spec section 6). */
export type DraftOutcome =
  | { kind: "created"; agreementId: string }
  /** A 400 the client checks should have prevented: the date fields it names, and the support code. */
  | { kind: "invalid"; fields: DraftField[]; correlationId?: string }
  /** The unit cannot get an agreement now: one text per reason group, in the answer's order. */
  | { kind: "refused"; reason: "notEligible"; groupKeys: EligibilityKey[] }
  | { kind: "refused"; reason: "exists" | "notAssignee" | "notFound" | "conflict" }
  | { kind: "failed"; correlationId?: string };

export type DraftFlowDeps = {
  createAgreement(body: BrokerageAgreementCreateRequest): Promise<ApiResult<BrokerageAgreementCreated>>;
};

const DEFAULT_DEPS: DraftFlowDeps = { createAgreement: (body) => createAgreement(body) };

const DATE_FIELDS: readonly string[] = ["startDate", "endDate"] satisfies DraftField[];
const GROUP_PREFIX = "reasonGroups.";

/**
 * Sends one draft and reads the answer by kind, status and `code`, never by message: 201 → `created`; 400
 * `VALIDATION_FAILED` → `invalid`; 409 `AGREEMENT_NOT_ELIGIBLE` → `notEligible` with the group texts; 409
 * `AGREEMENT_EXISTS`, 403 `AGREEMENT_NOT_ASSIGNEE`, 404 and 409 `CONCURRENT_MODIFICATION` → `refused`; any other answer
 * (400 `MALFORMED_REQUEST`, 403 `FORBIDDEN`, 500, no answer, no session, a 201 without an id) → `failed`.
 */
export async function submitDraft(
  body: BrokerageAgreementCreateRequest,
  deps: DraftFlowDeps = DEFAULT_DEPS,
): Promise<DraftOutcome> {
  const result = await deps.createAgreement(body);
  if (result.ok) {
    const { agreementId } = result.data;
    return agreementId === undefined || agreementId === "" ? { kind: "failed" } : { kind: "created", agreementId };
  }
  if (result.kind !== "http") return { kind: "failed" };

  const { status, code, fieldErrors, correlationId } = result;
  if (status === 400 && code === "VALIDATION_FAILED") {
    const fields = fieldErrors.map((entry) => entry.field).filter((field): field is DraftField => DATE_FIELDS.includes(field));
    return correlationId === undefined ? { kind: "invalid", fields } : { kind: "invalid", fields, correlationId };
  }
  if (status === 409 && code === "AGREEMENT_NOT_ELIGIBLE") {
    const groupKeys = fieldErrors
      .filter((entry) => entry.field.startsWith(GROUP_PREFIX))
      .map((entry) => reasonText(entry.field.slice(GROUP_PREFIX.length)));
    return { kind: "refused", reason: "notEligible", groupKeys };
  }
  if (status === 409 && code === "AGREEMENT_EXISTS") return { kind: "refused", reason: "exists" };
  if (status === 403 && code === "AGREEMENT_NOT_ASSIGNEE") return { kind: "refused", reason: "notAssignee" };
  if (status === 404) return { kind: "refused", reason: "notFound" };
  if (status === 409 && code === "CONCURRENT_MODIFICATION") return { kind: "refused", reason: "conflict" };
  return correlationId === undefined ? { kind: "failed" } : { kind: "failed", correlationId };
}
