import type { ApiResult } from "@/features/auth/client";

import { submitDraft } from "../services/agreement-api";
import type { BrokerageAgreementDraftSubmissionRequest } from "../types";

import { type EligibilityKey, reasonText } from "./reason-text";
import { versionPartText } from "./version-part-text";

/** What one send of the draft ended with, for the send dialog (brokerage-agreement E05-S4, spec section 6). */
export type DraftSendOutcome =
  | { kind: "sent" }
  /** The version misses parts (S4-D5): one text per part, in the answer's order. */
  | { kind: "refused"; reason: "incomplete"; partKeys: EligibilityKey[] }
  /** The draft's basis cannot hold an agreement now: one text per reason group, in the answer's order. */
  | { kind: "refused"; reason: "notEligible"; groupKeys: EligibilityKey[] }
  | { kind: "refused"; reason: "notDraft" | "stale" | "sendingOff" | "notAssignee" | "notFound" }
  | { kind: "failed"; correlationId?: string };

export type DraftSendFlowDeps = {
  submitDraft(agreementId: string, body: BrokerageAgreementDraftSubmissionRequest): Promise<ApiResult<undefined>>;
};

const DEFAULT_DEPS: DraftSendFlowDeps = { submitDraft: (agreementId, body) => submitDraft(agreementId, body) };

const GROUP_PREFIX = "reasonGroups.";

/**
 * Sends the draft once with the data version the page read (brokerage-agreement S4-D2) and reads the answer by kind,
 * status and `code`, never by message (spec section 4, S4-D11): 204 → `sent`; 409 `AGREEMENT_VERSION_INCOMPLETE` →
 * `incomplete` with the part texts; 409 `AGREEMENT_NOT_ELIGIBLE` → `notEligible` with the group texts; 409
 * `AGREEMENT_NOT_DRAFT` → `notDraft`; 409 `CONCURRENT_MODIFICATION`, a stale data version or a lost race alike →
 * `stale`; 409 `AGREEMENT_SENDING_NOT_AVAILABLE` (BR-19's switch off) → `sendingOff`; 403 `AGREEMENT_NOT_ASSIGNEE` →
 * `notAssignee`; 404 and 403 `FORBIDDEN` → `notFound`; any other answer (400, 500, no answer, no session) → `failed`
 * with its support code.
 */
export async function sendDraft(
  agreementId: string,
  dataVersion: number,
  deps: DraftSendFlowDeps = DEFAULT_DEPS,
): Promise<DraftSendOutcome> {
  const result = await deps.submitDraft(agreementId, { expectedDataVersion: dataVersion });
  if (result.ok) return { kind: "sent" };
  if (result.kind !== "http") return { kind: "failed" };

  const { status, code, fieldErrors, correlationId } = result;
  if (status === 409 && code === "AGREEMENT_VERSION_INCOMPLETE") {
    return { kind: "refused", reason: "incomplete", partKeys: fieldErrors.map((entry) => versionPartText(entry.field)) };
  }
  if (status === 409 && code === "AGREEMENT_NOT_ELIGIBLE") {
    const groupKeys = fieldErrors
      .filter((entry) => entry.field.startsWith(GROUP_PREFIX))
      .map((entry) => reasonText(entry.field.slice(GROUP_PREFIX.length)));
    return { kind: "refused", reason: "notEligible", groupKeys };
  }
  if (status === 409 && code === "AGREEMENT_NOT_DRAFT") return { kind: "refused", reason: "notDraft" };
  if (status === 409 && code === "CONCURRENT_MODIFICATION") return { kind: "refused", reason: "stale" };
  if (status === 409 && code === "AGREEMENT_SENDING_NOT_AVAILABLE") return { kind: "refused", reason: "sendingOff" };
  if (status === 403 && code === "AGREEMENT_NOT_ASSIGNEE") return { kind: "refused", reason: "notAssignee" };
  if (status === 404 || (status === 403 && code === "FORBIDDEN")) return { kind: "refused", reason: "notFound" };
  return correlationId === undefined ? { kind: "failed" } : { kind: "failed", correlationId };
}
