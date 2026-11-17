import { callApi, type ApiResult, type CallApi } from "@/features/auth/client";

import type {
  BrokerageAgreementConfirmationRequest,
  BrokerageAgreementOwnerList,
  BrokerageAgreementRejectionRequest,
} from "../types";

// The owner's side of the brokerage agreement (brokerage-agreement E05-S5, US-2). Kept apart from the staff calls, so
// the account page loads none of them. The password travels in the body of one POST only (BR-17).

export type OwnerAgreementDeps = { callApi: CallApi };

const DEFAULT_DEPS: OwnerAgreementDeps = { callApi };

/**
 * GET the account's agreements holding a sent version (S5-D1); the server logs every read, one row per agreement
 * answered (BR-17), so the page reads only when it needs to.
 */
export function listMine(deps: OwnerAgreementDeps = DEFAULT_DEPS): Promise<ApiResult<BrokerageAgreementOwnerList>> {
  return deps.callApi((client) => client.GET("/api/v1/me/brokerage-agreements"));
}

/**
 * POST the confirmation of one or several sent versions with the current password and the statement version read
 * (brokerage-agreement US-2 AC-2, AC-4, S5-D5): all or none; a 204 has no body, so the page reads the list again.
 */
export function confirmVersions(
  body: BrokerageAgreementConfirmationRequest,
  deps: OwnerAgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) => client.POST("/api/v1/me/brokerage-agreements/confirmations", { body }));
}

/**
 * POST the rejection of the version waiting for the owner, with an optional private reason (brokerage-agreement US-2
 * AC-3, S5-D7); a 204 has no body, so the page reads the list again.
 */
export function rejectVersion(
  agreementId: string,
  body: BrokerageAgreementRejectionRequest,
  deps: OwnerAgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/me/brokerage-agreements/{agreementId}/rejection", { params: { path: { agreementId } }, body }),
  );
}
