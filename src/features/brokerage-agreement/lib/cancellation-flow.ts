import type { ApiResult } from "@/features/auth/client";

import { cancelAgreement } from "../services/agreement-api";
import type { BrokerageAgreementCancellationRequest } from "../types";

import { type StopOutcome, stopOutcomeOf } from "./suspension-flow";

export type CancellationFlowDeps = {
  cancelAgreement(agreementId: string, body: BrokerageAgreementCancellationRequest): Promise<ApiResult<undefined>>;
};

const DEFAULT_DEPS: CancellationFlowDeps = { cancelAgreement: (agreementId, body) => cancelAgreement(agreementId, body) };

/**
 * Cancels an agreement that never took effect once (brokerage-agreement US-1 AC-5, BR-5, S8-D7), against the data
 * version the page read; one that took effect answers 409 AGREEMENT_TOOK_EFFECT ("end it instead").
 */
export async function cancel(
  agreementId: string,
  input: { dataVersion: number },
  deps: CancellationFlowDeps = DEFAULT_DEPS,
): Promise<StopOutcome> {
  return stopOutcomeOf(await deps.cancelAgreement(agreementId, { expectedDataVersion: input.dataVersion }));
}
