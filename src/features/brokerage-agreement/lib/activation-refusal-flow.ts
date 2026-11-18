import type { ApiResult } from "@/features/auth/client";

import { refuseActivation as postRefusal } from "../services/agreement-api";
import type { ActivationRefusalType, BrokerageAgreementActivationRefusalRequest } from "../types";

/**
 * What one refusal of activation ended with, for the refusal dialog (brokerage-agreement E05-S6, spec section 6).
 * `recorded`: the refusal was stored; `refused`: the server refused the request.
 */
export type ActivationRefusalOutcome =
  | { kind: "recorded" }
  /**
   * `notIndependent`: the viewer drafted a version or is the lead's assignee; `reload`: the version no longer awaits
   * activation; `concurrent`: a change at the same time; `badNote`: the server refused the note's characters or length;
   * `notFound`: unknown, not visible or a role that may not decide.
   */
  | { kind: "refused"; reason: "notIndependent" | "reload" | "concurrent" | "badNote" | "notFound" }
  | { kind: "failed"; correlationId?: string };

export type ActivationRefusalFlowDeps = {
  refuseActivation(agreementId: string, body: BrokerageAgreementActivationRefusalRequest): Promise<ApiResult<undefined>>;
};

const DEFAULT_DEPS: ActivationRefusalFlowDeps = { refuseActivation: (agreementId, body) => postRefusal(agreementId, body) };

const NOTE_FIELD = "note";

/**
 * Refuses the activation of the confirmed version once (brokerage-agreement US-3 AC-3, S6-D4) with one of the two
 * reasons and the note as the manager typed it, the server trimming and checking it; a blank one is sent as null
 * (E05S6-P9 (f)). The answer is read by kind, status, `code` and field, never by message: 204 → `recorded`; 403
 * `AGREEMENT_ACTIVATOR_NOT_INDEPENDENT` → `notIndependent`; 409 `AGREEMENT_NOT_AWAITING_ACTIVATION` → `reload`; 409
 * `CONCURRENT_MODIFICATION` → `concurrent`; 400 whose entries all name `note` → `badNote`; 404 and 403 `FORBIDDEN` →
 * `notFound`; any other answer → `failed` with its support code. The note is never part of an outcome (BR-17).
 */
export async function refuseActivation(
  agreementId: string,
  input: { versionNo: number; reasonType: ActivationRefusalType; noteText: string; dataVersion: number },
  deps: ActivationRefusalFlowDeps = DEFAULT_DEPS,
): Promise<ActivationRefusalOutcome> {
  const note = input.noteText.trim() === "" ? null : input.noteText;
  const result = await deps.refuseActivation(agreementId, {
    expectedDataVersion: input.dataVersion,
    versionNo: input.versionNo,
    reasonType: input.reasonType,
    note,
  });
  if (result.ok) return { kind: "recorded" };
  if (result.kind !== "http") return { kind: "failed" };

  const { status, code, fieldErrors, correlationId } = result;
  if (status === 403 && code === "AGREEMENT_ACTIVATOR_NOT_INDEPENDENT") return { kind: "refused", reason: "notIndependent" };
  if (status === 409 && code === "AGREEMENT_NOT_AWAITING_ACTIVATION") return { kind: "refused", reason: "reload" };
  if (status === 409 && code === "CONCURRENT_MODIFICATION") return { kind: "refused", reason: "concurrent" };
  if (status === 400 && fieldErrors.length > 0 && fieldErrors.every((entry) => entry.field === NOTE_FIELD)) {
    return { kind: "refused", reason: "badNote" };
  }
  if (status === 404 || (status === 403 && code === "FORBIDDEN")) return { kind: "refused", reason: "notFound" };
  return correlationId === undefined ? { kind: "failed" } : { kind: "failed", correlationId };
}
