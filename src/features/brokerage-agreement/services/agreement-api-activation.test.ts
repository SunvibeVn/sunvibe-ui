import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementActivationRefusalRequest, BrokerageAgreementActivationRequest } from "../types";

import { activate, refuseActivation } from "./agreement-api";

/** A fake `callApi` that runs the request against a client recording each POST, and answers `answer` as it is. */
function recording<T>(answer: ApiResult<T>) {
  const calls: { method: string; path: string; options: unknown }[] = [];
  const client = {
    POST: (path: string, options: unknown) => {
      calls.push({ method: "POST", path, options });
      return Promise.resolve();
    },
  };
  const callApi = vi.fn(async (run: (c: never) => unknown) => {
    await run(client as never);
    return answer as never;
  });
  return { calls, callApi };
}

describe("activation calls (brokerage-agreement E05-S6, S6-D1, S6-D4)", () => {
  it("agreementApi_activate_postsTheBody: one POST of the activation body to the activation path, through callApi, its answer returned as it is", async () => {
    const body: BrokerageAgreementActivationRequest = {
      expectedDataVersion: 7,
      versionNo: 2,
      statementVersion: "brokerage-activation-2026-11",
      documentNumber: "HDMG-2026/014",
      signedOn: "2026-11-16",
      sunvibeSignatoryName: "Nguyen Van A",
      sunvibeSignatoryTitle: "Director",
    };
    const answer: ApiResult<undefined> = { ok: true, data: undefined, status: 204, replayed: false };
    const { calls, callApi } = recording(answer);

    const result = await activate("A1", body, { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/v1/staff/brokerage-agreements/{agreementId}/activation",
        options: { params: { path: { agreementId: "A1" } }, body },
      },
    ]);
  });

  it("agreementApi_refuseActivation_postsTheBody: one POST of the refusal body to the activation-refusal path, through callApi, its answer returned as it is", async () => {
    const body: BrokerageAgreementActivationRefusalRequest = {
      expectedDataVersion: 7,
      versionNo: 2,
      reasonType: "DOCUMENT_DIFFERS",
      note: "Rent differs.",
    };
    const answer: ApiResult<undefined> = {
      ok: false,
      kind: "http",
      status: 409,
      code: "AGREEMENT_NOT_AWAITING_ACTIVATION",
      fieldErrors: [],
    };
    const { calls, callApi } = recording(answer);

    const result = await refuseActivation("A1", body, { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/v1/staff/brokerage-agreements/{agreementId}/activation-refusal",
        options: { params: { path: { agreementId: "A1" } }, body },
      },
    ]);
  });
});
