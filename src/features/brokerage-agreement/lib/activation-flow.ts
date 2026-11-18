import type { ApiResult } from "@/features/auth/client";

import { activate as postActivation } from "../services/agreement-api";
import type { BrokerageAgreementActivationRequest } from "../types";

import type { ActivationField } from "./activation-form";
import { type EligibilityKey, reasonText } from "./reason-text";

/** What one activation ended with, for the activation section (brokerage-agreement E05-S6, spec section 6). */
export type ActivationOutcome =
  | { kind: "activated" }
  /** The unit cannot get an agreement now: one text per reason group, in the answer's order. */
  | { kind: "refused"; reason: "notEligible"; groupKeys: EligibilityKey[] }
  /** The server refused a value of the document: one text per field. */
  | { kind: "refused"; reason: "fields"; fields: Partial<Record<ActivationField, EligibilityKey>> }
  /**
   * `notIndependent`: the viewer drafted a version or is the lead's assignee; `reload`: the version no longer awaits
   * activation or the statement changed (the page is out of date); `periodEnded`: the version's end has passed;
   * `concurrent`: a change at the same time; `notFound`: unknown, not visible or a role that may not decide.
   */
  | { kind: "refused"; reason: "notIndependent" | "reload" | "periodEnded" | "concurrent" | "notFound" }
  | { kind: "failed"; correlationId?: string };

export type ActivationFlowDeps = {
  activate(agreementId: string, body: BrokerageAgreementActivationRequest): Promise<ApiResult<undefined>>;
};

const DEFAULT_DEPS: ActivationFlowDeps = { activate: (agreementId, body) => postActivation(agreementId, body) };

const GROUP_PREFIX = "reasonGroups.";

/** A server 400 entry on a field of the document, read after the browser's checks passed (E05S6-P9 (e)). */
const FIELD_TEXT: Record<ActivationField, EligibilityKey> = {
  documentNumber: "activation.errors.characters",
  signedOn: "activation.errors.signedOn",
  sunvibeSignatoryName: "activation.errors.characters",
  sunvibeSignatoryTitle: "activation.errors.characters",
};

const isDocumentField = (field: string): field is ActivationField => Object.hasOwn(FIELD_TEXT, field);

/**
 * Activates the confirmed version once (brokerage-agreement US-3 AC-1, AC-2, S6-D1, S6-D16) and reads the answer by
 * kind, status, `code` and field, never by message: 204 → `activated`; 403 `AGREEMENT_ACTIVATOR_NOT_INDEPENDENT` →
 * `notIndependent`; 409 `AGREEMENT_NOT_AWAITING_ACTIVATION` or `AGREEMENT_STATEMENT_OUTDATED` → `reload`; 409
 * `AGREEMENT_VERSION_PERIOD_ENDED` → `periodEnded`; 409 `AGREEMENT_NOT_ELIGIBLE` → `notEligible` with the group texts;
 * 409 `CONCURRENT_MODIFICATION`, a stale data version or a lost race alike → `concurrent`; 400 whose entries all name a
 * field of the document → `fields` (a text field's entry is the character rule, since the browser holds the lengths;
 * the date's is its window); 404 and 403 `FORBIDDEN` → `notFound`; any other answer → `failed` with its support code.
 * No value of the body is part of an outcome (BR-17).
 */
export async function activateVersion(
  agreementId: string,
  body: BrokerageAgreementActivationRequest,
  deps: ActivationFlowDeps = DEFAULT_DEPS,
): Promise<ActivationOutcome> {
  const result = await deps.activate(agreementId, body);
  if (result.ok) return { kind: "activated" };
  if (result.kind !== "http") return { kind: "failed" };

  const { status, code, fieldErrors, correlationId } = result;
  if (status === 403 && code === "AGREEMENT_ACTIVATOR_NOT_INDEPENDENT") return { kind: "refused", reason: "notIndependent" };
  if (status === 409 && (code === "AGREEMENT_NOT_AWAITING_ACTIVATION" || code === "AGREEMENT_STATEMENT_OUTDATED")) {
    return { kind: "refused", reason: "reload" };
  }
  if (status === 409 && code === "AGREEMENT_VERSION_PERIOD_ENDED") return { kind: "refused", reason: "periodEnded" };
  if (status === 409 && code === "AGREEMENT_NOT_ELIGIBLE") {
    const groupKeys = fieldErrors
      .filter((entry) => entry.field.startsWith(GROUP_PREFIX))
      .map((entry) => reasonText(entry.field.slice(GROUP_PREFIX.length)));
    return { kind: "refused", reason: "notEligible", groupKeys };
  }
  if (status === 409 && code === "CONCURRENT_MODIFICATION") return { kind: "refused", reason: "concurrent" };
  if (
    status === 400 &&
    code === "VALIDATION_FAILED" &&
    fieldErrors.length > 0 &&
    fieldErrors.every((entry) => isDocumentField(entry.field))
  ) {
    const fields: Partial<Record<ActivationField, EligibilityKey>> = {};
    for (const entry of fieldErrors) {
      const field = entry.field as ActivationField;
      fields[field] = FIELD_TEXT[field];
    }
    return { kind: "refused", reason: "fields", fields };
  }
  if (status === 404 || (status === 403 && code === "FORBIDDEN")) return { kind: "refused", reason: "notFound" };
  return correlationId === undefined ? { kind: "failed" } : { kind: "failed", correlationId };
}
