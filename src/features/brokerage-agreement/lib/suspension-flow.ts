import type { ApiResult } from "@/features/auth/client";

import { suspendAgreement } from "../services/agreement-api";
import type { BrokerageAgreementSuspensionRequest, SuspensionReasonType } from "../types";

/**
 * What one stop command ended with, for its dialog (brokerage-agreement E05-S8, spec section 6, E05S8-P13, E05S8-P15):
 * `done` (204: the dialog closes and the page reads the agreement again); `fields` (400 naming fields: their errors);
 * `concurrent` (409 CONCURRENT_MODIFICATION: "Something changed at the same time." with "Reload"); `changed` (403 or
 * another 409, with its code: the dialog closes, the page reads the agreement again and shows the code's sentence);
 * `notFound` (404); `failed` (anything else, with its support code). No private value is part of an outcome (BR-17).
 */
export type StopOutcome =
  | { kind: "done" }
  | { kind: "fields"; fields: string[] }
  | { kind: "concurrent" }
  | { kind: "changed"; code: string }
  | { kind: "notFound" }
  | { kind: "failed"; correlationId?: string };

/**
 * Reads the answer of a stop command (suspension, release, termination, cancellation) by kind, status, `code` and
 * field, never by message: the four commands share this reading, each with its own codes behind `changed`.
 */
export function stopOutcomeOf(result: ApiResult<undefined>): StopOutcome {
  if (result.ok) return { kind: "done" };
  if (result.kind !== "http") return { kind: "failed" };
  const { status, code, fieldErrors, correlationId } = result;
  if (status === 400 && fieldErrors.length > 0) return { kind: "fields", fields: fieldErrors.map((entry) => entry.field) };
  if (status === 409 && code === "CONCURRENT_MODIFICATION") return { kind: "concurrent" };
  // Any other 403 or 409, a code this UI does not know or none included: the state changed (S8-D12, E05S8-P13).
  if (status === 403 || status === 409) return { kind: "changed", code: code ?? "" };
  if (status === 404) return { kind: "notFound" };
  return correlationId === undefined ? { kind: "failed" } : { kind: "failed", correlationId };
}

export type SuspensionFlowDeps = {
  suspendAgreement(agreementId: string, body: BrokerageAgreementSuspensionRequest): Promise<ApiResult<undefined>>;
};

const DEFAULT_DEPS: SuspensionFlowDeps = { suspendAgreement: (agreementId, body) => suspendAgreement(agreementId, body) };

/**
 * Suspends an agreement in effect once (brokerage-agreement US-5 AC-2, BR-15, S8-D6) with the reason chosen and the
 * note as typed, the server trimming and checking it; a blank note is sent as null. No data version: a suspension is
 * refused only by its state (S8-D8's named narrowing).
 */
export async function suspend(
  agreementId: string,
  input: { reasonType: SuspensionReasonType; noteText: string },
  deps: SuspensionFlowDeps = DEFAULT_DEPS,
): Promise<StopOutcome> {
  const note = input.noteText.trim() === "" ? null : input.noteText;
  return stopOutcomeOf(await deps.suspendAgreement(agreementId, { reasonType: input.reasonType, note }));
}
