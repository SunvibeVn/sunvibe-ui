import type { ApiResult } from "@/features/auth/client";

import { rejectVersion as postRejection } from "../services/owner-agreement-api";
import type { BrokerageAgreementRejectionRequest } from "../types";

/** What one rejection ended with, for the decline dialog (brokerage-agreement E05-S5, spec section 6). */
export type OwnerRejectOutcome =
  | { kind: "declined" }
  /**
   * `reload`: the version no longer waits for the owner, or is gone; `badReason`: the server refused the reason's
   * characters or length; `tooMany`: the rate limit; `concurrent`: a change at the same moment.
   */
  | { kind: "refused"; reason: "reload" | "badReason" | "tooMany" | "concurrent" }
  | { kind: "failed"; correlationId?: string };

export type OwnerRejectFlowDeps = {
  rejectVersion(agreementId: string, body: BrokerageAgreementRejectionRequest): Promise<ApiResult<undefined>>;
};

const DEFAULT_DEPS: OwnerRejectFlowDeps = { rejectVersion: (agreementId, body) => postRejection(agreementId, body) };

const REASON_FIELD = "reason";

/**
 * Declines one version once (brokerage-agreement US-2 AC-3, S5-D7): the reason as the owner typed it, the server trimming
 * and checking it; a blank one is sent as null, no reason given. The answer is read by kind, status, `code` and field,
 * never by message: 204 → `declined`; 404 and 409 `AGREEMENT_NOT_AWAITING_OWNER` → `reload`; 400 on `reason` →
 * `badReason`; 429 → `tooMany`; 409 `CONCURRENT_MODIFICATION` → `concurrent`; any other answer → `failed` with its
 * support code. The reason is never part of an outcome (BR-17).
 */
export async function rejectVersion(
  agreementId: string,
  versionNo: number,
  reasonText: string,
  deps: OwnerRejectFlowDeps = DEFAULT_DEPS,
): Promise<OwnerRejectOutcome> {
  const reason = reasonText.trim() === "" ? null : reasonText;
  const result = await deps.rejectVersion(agreementId, { versionNo, reason });
  if (result.ok) return { kind: "declined" };
  if (result.kind !== "http") return { kind: "failed" };

  const { status, code, fieldErrors, correlationId } = result;
  if (status === 404 || (status === 409 && code === "AGREEMENT_NOT_AWAITING_OWNER")) {
    return { kind: "refused", reason: "reload" };
  }
  if (status === 400 && fieldErrors.length > 0 && fieldErrors.every((entry) => entry.field === REASON_FIELD)) {
    return { kind: "refused", reason: "badReason" };
  }
  if (status === 429) return { kind: "refused", reason: "tooMany" };
  if (status === 409 && code === "CONCURRENT_MODIFICATION") return { kind: "refused", reason: "concurrent" };
  return correlationId === undefined ? { kind: "failed" } : { kind: "failed", correlationId };
}
