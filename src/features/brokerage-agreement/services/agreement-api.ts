import { callApi, type ApiResult, type CallApi } from "@/features/auth/client";

import type {
  BrokerageAgreementCreated,
  BrokerageAgreementCreateRequest,
  BrokerageAgreementDetail,
  BrokerageAgreementDraftRequest,
  BrokerageAgreementDraftSubmissionRequest,
  BrokerageAgreementNewDraftRequest,
  BrokerageAgreementSurveyTerms,
} from "../types";

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

/**
 * PUT the whole draft against the data version the page read (brokerage-agreement BR-5, S3-D1); a 204 has no body, so
 * the page reads the detail again.
 */
export function updateDraft(
  agreementId: string,
  body: BrokerageAgreementDraftRequest,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.PUT("/api/v1/staff/brokerage-agreements/{agreementId}/draft", { params: { path: { agreementId } }, body }),
  );
}

/**
 * POST the sending of the draft to the owner against the data version the page read (brokerage-agreement US-1 AC-5,
 * S4-D2); a 204 has no body, so the page reads the detail again.
 */
export function submitDraft(
  agreementId: string,
  body: BrokerageAgreementDraftSubmissionRequest,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/brokerage-agreements/{agreementId}/draft/submission", {
      params: { path: { agreementId } },
      body,
    }),
  );
}

/**
 * POST the opening of the next draft version against the data version the page read (brokerage-agreement BR-5,
 * S5-D10): a copy of the latest version, after the owner declined it or did not answer in time; a 204 has no body, so
 * the page reads the detail again.
 */
export function openDraft(
  agreementId: string,
  body: BrokerageAgreementNewDraftRequest,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/brokerage-agreements/{agreementId}/draft", { params: { path: { agreementId } }, body }),
  );
}

/** GET the survey's values for the draft's terms, with sources and dates; the server writes nothing (S3-D11). */
export function getSurveyTerms(
  agreementId: string,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<BrokerageAgreementSurveyTerms>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/brokerage-agreements/{agreementId}/survey-terms", { params: { path: { agreementId } } }),
  );
}
