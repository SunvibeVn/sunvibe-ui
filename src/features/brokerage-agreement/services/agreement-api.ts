import { callApi, type ApiResult, type CallApi } from "@/features/auth/client";

import type { BrokerageAgreementCreated, BrokerageAgreementCreateRequest, BrokerageAgreementDetail } from "../types";

export type AgreementDeps = { callApi: CallApi };

const DEFAULT_DEPS: AgreementDeps = { callApi };

/** POST a draft agreement for one unit of the lead's basis; the answer holds its id only (brokerage-agreement US-1). */
export function createAgreement(
  body: BrokerageAgreementCreateRequest,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<BrokerageAgreementCreated>> {
  return deps.callApi((client) => client.POST("/api/v1/staff/brokerage-agreements", { body }));
}

/** GET the agreement and its versions; the server logs every read (brokerage-agreement BR-17). */
export function getAgreement(
  agreementId: string,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<BrokerageAgreementDetail>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/brokerage-agreements/{agreementId}", { params: { path: { agreementId } } }),
  );
}
