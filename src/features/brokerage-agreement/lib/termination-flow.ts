import type { ApiResult } from "@/features/auth/client";

import { terminateAgreement } from "../services/agreement-api";
import type { BrokerageAgreementTerminationRequest } from "../types";

import { type StopOutcome, stopOutcomeOf } from "./suspension-flow";

export type TerminationFlowDeps = {
  terminateAgreement(agreementId: string, body: BrokerageAgreementTerminationRequest): Promise<ApiResult<undefined>>;
};

const DEFAULT_DEPS: TerminationFlowDeps = { terminateAgreement: (agreementId, body) => terminateAgreement(agreementId, body) };

/**
 * Terminates an agreement that has not ended once (brokerage-agreement US-5 AC-2, BR-14, S8-D5) with the body the form
 * built: the type and exactly its fields. No data version: a termination is refused only by its state (S8-D8's named
 * narrowing); who may record each type is the server's (403 AGREEMENT_ASSIGNEE_ONLY, AGREEMENT_TERMINATION_NOT_ALLOWED).
 */
export async function terminate(
  agreementId: string,
  body: BrokerageAgreementTerminationRequest,
  deps: TerminationFlowDeps = DEFAULT_DEPS,
): Promise<StopOutcome> {
  return stopOutcomeOf(await deps.terminateAgreement(agreementId, body));
}
