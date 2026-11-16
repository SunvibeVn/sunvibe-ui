import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementCreated, BrokerageAgreementCreateRequest, BrokerageAgreementDetail } from "../types";

import { createAgreement, getAgreement } from "./agreement-api";

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
