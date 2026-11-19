import { callApi, type ApiResult, type CallApi } from "@/features/auth/client";

import type {
  AgreementListQuery,
  BrokerageAgreementActivationRefusalRequest,
  BrokerageAgreementActivationRequest,
  BrokerageAgreementCancellationRequest,
  BrokerageAgreementCreated,
  BrokerageAgreementCreateRequest,
  BrokerageAgreementDetail,
  BrokerageAgreementDraftRequest,
  BrokerageAgreementDraftSubmissionRequest,
  BrokerageAgreementHistory,
  BrokerageAgreementNewDraftRequest,
  BrokerageAgreementPage,
  BrokerageAgreementSurveyTerms,
  BrokerageAgreementSuspensionReleaseRequest,
  BrokerageAgreementSuspensionRequest,
  BrokerageAgreementTerminationRequest,
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
 * S5-D10): a copy of the latest version, once the latest version did not take effect (the owner declined it or did not
 * answer in time, or a manager refused its activation or did not activate it in time, S6-D24); a 204 has no body, so
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

/**
 * POST the activation of the version the owner confirmed, with the signed document's four values, the statement version
 * the page read and its data version (brokerage-agreement US-3 AC-1, AC-2, S6-D1, S6-D3); a 204 has no body, so the
 * page reads the detail again. The server decides who may activate (S6-D2).
 */
export function activate(
  agreementId: string,
  body: BrokerageAgreementActivationRequest,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/brokerage-agreements/{agreementId}/activation", { params: { path: { agreementId } }, body }),
  );
}

/**
 * POST the refusal to activate the version the owner confirmed, with one of two reasons and an optional note, against
 * the data version the page read (brokerage-agreement US-3 AC-3, S6-D4); a 204 has no body, so the page reads the
 * detail again.
 */
export function refuseActivation(
  agreementId: string,
  body: BrokerageAgreementActivationRefusalRequest,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/brokerage-agreements/{agreementId}/activation-refusal", {
      params: { path: { agreementId } },
      body,
    }),
  );
}

/**
 * POST the suspension of an agreement in effect, with one of four reasons and an optional note (brokerage-agreement
 * US-5 AC-2, BR-15, S8-D6). No data version: a stop is refused only by its state (S8-D8). A 204 has no body, so the
 * page reads the detail again. The server decides who may suspend (a manager).
 */
export function suspendAgreement(
  agreementId: string,
  body: BrokerageAgreementSuspensionRequest,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/brokerage-agreements/{agreementId}/suspension", { params: { path: { agreementId } }, body }),
  );
}

/**
 * POST the release of a suspension, with a required reason against the data version the page read (brokerage-agreement
 * US-5 AC-5, BR-5, BR-15, S8-D6); a 204 has no body, so the page reads the detail again. The server decides who may
 * lift it (a manager who is not the lead's assigned Sale).
 */
export function releaseAgreementSuspension(
  agreementId: string,
  body: BrokerageAgreementSuspensionReleaseRequest,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/brokerage-agreements/{agreementId}/suspension-release", {
      params: { path: { agreementId } },
      body,
    }),
  );
}

/**
 * POST the termination of an agreement that has not ended, with its type and that type's fields (brokerage-agreement
 * US-5 AC-2, BR-14, S8-D5). No data version: a stop is refused only by its state (S8-D8). A 204 has no body, so the
 * page reads the detail again. The server decides who may record each type.
 */
export function terminateAgreement(
  agreementId: string,
  body: BrokerageAgreementTerminationRequest,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/brokerage-agreements/{agreementId}/termination", { params: { path: { agreementId } }, body }),
  );
}

/**
 * POST the cancellation of an agreement that never took effect, against the data version the page read
 * (brokerage-agreement US-1 AC-5, BR-5, S8-D7); a 204 has no body, so the page reads the detail again. The server
 * decides who may cancel (the lead's assigned Sale).
 */
export function cancelAgreement(
  agreementId: string,
  body: BrokerageAgreementCancellationRequest,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<undefined>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/brokerage-agreements/{agreementId}/cancellation", { params: { path: { agreementId } }, body }),
  );
}

/**
 * GET one page of the agreements in the caller's scope, each with its state and advertising answer at the read
 * (brokerage-agreement US-4 AC-3, S7-D1 to S7-D5); the server decides the scope and logs nothing for it (S7-D6).
 */
export function listAgreements(
  query: AgreementListQuery,
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<BrokerageAgreementPage>> {
  return deps.callApi((client) => client.GET("/api/v1/staff/brokerage-agreements", { params: { query } }));
}

/**
 * GET one page of the agreement's events, newest first, with who acted and when, never a reason (brokerage-agreement
 * US-4 AC-4, S7-D7); the read is not logged (S7-D6).
 */
export function getAgreementHistory(
  agreementId: string,
  query: { page: number; size: number },
  deps: AgreementDeps = DEFAULT_DEPS,
): Promise<ApiResult<BrokerageAgreementHistory>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/brokerage-agreements/{agreementId}/history", {
      params: { path: { agreementId }, query },
    }),
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
