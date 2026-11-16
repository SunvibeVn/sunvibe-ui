import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type {
  BrokerageAgreementCreated,
  BrokerageAgreementCreateRequest,
  BrokerageAgreementDetail,
  BrokerageAgreementDraftRequest,
  BrokerageAgreementDraftSubmissionRequest,
  BrokerageAgreementSurveyTerms,
} from "../types";

import { createAgreement, getAgreement, getSurveyTerms, submitDraft, updateDraft } from "./agreement-api";

/** A fake `callApi` that runs the request against a client recording each call, and answers `answer` as it is. */
function recording<T>(answer: ApiResult<T>) {
  const calls: { method: string; path: string; options: unknown }[] = [];
  const record = (method: string) => (path: string, options: unknown) => {
    calls.push({ method, path, options });
    return Promise.resolve();
  };
  const client = { GET: record("GET"), POST: record("POST") };
  const callApi = vi.fn(async (run: (c: never) => unknown) => {
    await run(client as never);
    return answer as never;
  });
  return { calls, callApi };
}

/** As `recording`, for the draft calls: a client that records each `PUT` and `GET`. */
function recordingDraftCalls<T>(answer: ApiResult<T>) {
  const calls: { method: string; path: string; options: unknown }[] = [];
  const record = (method: string) => (path: string, options: unknown) => {
    calls.push({ method, path, options });
    return Promise.resolve();
  };
  const client = { GET: record("GET"), PUT: record("PUT") };
  const callApi = vi.fn(async (run: (c: never) => unknown) => {
    await run(client as never);
    return answer as never;
  });
  return { calls, callApi };
}

describe("agreement calls (brokerage-agreement E05-S2)", () => {
  it("createAgreement_body_postsToTheAgreementsPath: one POST of the body, its answer returned as it is", async () => {
    const body: BrokerageAgreementCreateRequest = {
      leadId: "L1",
      unitId: "U1",
      transactionType: "LONG_TERM_RENT",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
    };
    const answer: ApiResult<BrokerageAgreementCreated> = {
      ok: true,
      data: { agreementId: "A1" },
      status: 201,
      replayed: false,
    };
    const { calls, callApi } = recording(answer);

    const result = await createAgreement(body, { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(calls).toEqual([{ method: "POST", path: "/api/v1/staff/brokerage-agreements", options: { body } }]);
  });

  it("getAgreement_id_readsTheAgreementPath: one GET of the agreement by its id, its answer returned as it is", async () => {
    const answer: ApiResult<BrokerageAgreementDetail> = { ok: false, kind: "http", status: 404, fieldErrors: [] };
    const { calls, callApi } = recording(answer);

    const result = await getAgreement("A1", { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(calls).toEqual([
      {
        method: "GET",
        path: "/api/v1/staff/brokerage-agreements/{agreementId}",
        options: { params: { path: { agreementId: "A1" } } },
      },
    ]);
  });
});

describe("draft calls (brokerage-agreement E05-S3)", () => {
  it("updateDraft_body_putsToTheDraftPath: one PUT of the whole draft to its agreement, its answer returned as it is", async () => {
    const body: BrokerageAgreementDraftRequest = {
      expectedDataVersion: 0,
      transactionType: "LONG_TERM_RENT",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      photoConsent: true,
      exteriorPhotoConsent: false,
      terms: {
        monthlyRent: { amount: 8000000, currency: "VND", unit: "MONTH" },
        deposit: null,
        minimumTermMonths: 12,
        paymentPeriodMonths: 1,
        mandatoryFees: [],
      },
    };
    const answer: ApiResult<undefined> = { ok: true, data: undefined, status: 204, replayed: false };
    const { calls, callApi } = recordingDraftCalls(answer);

    const result = await updateDraft("A1", body, { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(calls).toEqual([
      {
        method: "PUT",
        path: "/api/v1/staff/brokerage-agreements/{agreementId}/draft",
        options: { params: { path: { agreementId: "A1" } }, body },
      },
    ]);
  });

  it("getSurveyTerms_id_readsTheSurveyTermsPath: one GET of the survey reference by the agreement's id, its answer returned as it is", async () => {
    const answer: ApiResult<BrokerageAgreementSurveyTerms> = {
      ok: true,
      data: { terms: { monthlyRent: null }, sources: [] },
      status: 200,
      replayed: false,
    };
    const { calls, callApi } = recordingDraftCalls(answer);

    const result = await getSurveyTerms("A1", { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(calls).toEqual([
      {
        method: "GET",
        path: "/api/v1/staff/brokerage-agreements/{agreementId}/survey-terms",
        options: { params: { path: { agreementId: "A1" } } },
      },
    ]);
  });
});

describe("sending the draft (brokerage-agreement E05-S4, S4-D2)", () => {
  it("agreementApi_submitDraft_postsTheDataVersion: one POST of the data version to the submission path, through callApi, its answer returned as it is", async () => {
    const body: BrokerageAgreementDraftSubmissionRequest = { expectedDataVersion: 3 };
    const answer: ApiResult<undefined> = { ok: true, data: undefined, status: 204, replayed: false };
    const { calls, callApi } = recording(answer);

    const result = await submitDraft("A1", body, { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/v1/staff/brokerage-agreements/{agreementId}/draft/submission",
        options: { params: { path: { agreementId: "A1" } }, body: { expectedDataVersion: 3 } },
      },
    ]);
  });
});
