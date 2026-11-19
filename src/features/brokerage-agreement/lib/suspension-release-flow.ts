import type { ApiResult } from "@/features/auth/client";

import { releaseAgreementSuspension } from "../services/agreement-api";
import type { BrokerageAgreementSuspensionReleaseRequest } from "../types";

import { type StopOutcome, stopOutcomeOf } from "./suspension-flow";

export type SuspensionReleaseFlowDeps = {
  releaseAgreementSuspension(agreementId: string, body: BrokerageAgreementSuspensionReleaseRequest): Promise<ApiResult<undefined>>;
};

const DEFAULT_DEPS: SuspensionReleaseFlowDeps = {
  releaseAgreementSuspension: (agreementId, body) => releaseAgreementSuspension(agreementId, body),
};

/**
 * Lifts the suspension once (brokerage-agreement US-5 AC-5, BR-5, BR-15, S8-D6) with the reason as typed, the server
 * trimming and checking it, against the data version the page read: a stale one answers CONCURRENT_MODIFICATION.
 */
export async function releaseSuspension(
  agreementId: string,
  input: { reason: string; dataVersion: number },
  deps: SuspensionReleaseFlowDeps = DEFAULT_DEPS,
): Promise<StopOutcome> {
  return stopOutcomeOf(
    await deps.releaseAgreementSuspension(agreementId, { expectedDataVersion: input.dataVersion, reason: input.reason }),
  );
}
