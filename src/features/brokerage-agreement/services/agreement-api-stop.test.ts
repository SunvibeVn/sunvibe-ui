import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type {
  BrokerageAgreementCancellationRequest,
  BrokerageAgreementSuspensionReleaseRequest,
  BrokerageAgreementSuspensionRequest,
  BrokerageAgreementTerminationRequest,
} from "../types";

import { cancelAgreement, releaseAgreementSuspension, suspendAgreement, terminateAgreement } from "./agreement-api";

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

const NO_CONTENT: ApiResult<undefined> = { ok: true, data: undefined, status: 204, replayed: false };

// Each call goes through `callApi` (the signed-in client of auth, which sends the Bearer and `credentials: 'omit'` on
// every request and lets no call set another value), with only the path parameter and the body: no option of its own.
describe("stop calls (brokerage-agreement E05-S8, spec section 4)", () => {
  it("agreementApi_suspend_postsTheBody: one POST of the reason and the note to the suspension path, through callApi, its answer returned as it is", async () => {
    const body: BrokerageAgreementSuspensionRequest = { reasonType: "COMPLAINT", note: "Tenant reported a different price." };
    const { calls, callApi } = recording(NO_CONTENT);

    const result = await suspendAgreement("A1", body, { callApi: callApi as never });

    expect(result).toBe(NO_CONTENT);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/v1/staff/brokerage-agreements/{agreementId}/suspension",
        options: { params: { path: { agreementId: "A1" } }, body },
      },
    ]);
  });

  it("agreementApi_releaseSuspension_postsReasonAndDataVersion: one POST of the reason and the data version the page read to the suspension-release path", async () => {
    const body: BrokerageAgreementSuspensionReleaseRequest = { expectedDataVersion: 7, reason: "The price was checked with the owner." };
    const answer: ApiResult<undefined> = {
      ok: false,
      kind: "http",
      status: 403,
      code: "AGREEMENT_RELEASER_NOT_INDEPENDENT",
      fieldErrors: [],
    };
    const { calls, callApi } = recording(answer);

    const result = await releaseAgreementSuspension("A1", body, { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/v1/staff/brokerage-agreements/{agreementId}/suspension-release",
        options: { params: { path: { agreementId: "A1" } }, body },
      },
    ]);
  });

  it("agreementApi_terminate_postsTheGivenBody: one POST of the body as given to the termination path, no data version added", async () => {
    const body: BrokerageAgreementTerminationRequest = {
      type: "UNIT_LET",
      reportedOn: "2026-12-02",
      introducedBySunvibe: "UNKNOWN",
      note: null,
    };
    const { calls, callApi } = recording(NO_CONTENT);

    const result = await terminateAgreement("A1", body, { callApi: callApi as never });

    expect(result).toBe(NO_CONTENT);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/v1/staff/brokerage-agreements/{agreementId}/termination",
        options: { params: { path: { agreementId: "A1" } }, body },
      },
    ]);
    expect(Object.keys((calls[0]?.options as { body: object }).body).sort()).toEqual([
      "introducedBySunvibe",
      "note",
      "reportedOn",
      "type",
    ]);
  });

  it("agreementApi_cancel_postsTheDataVersion: one POST of the data version the page read to the cancellation path", async () => {
    const body: BrokerageAgreementCancellationRequest = { expectedDataVersion: 3 };
    const answer: ApiResult<undefined> = { ok: false, kind: "http", status: 409, code: "AGREEMENT_TOOK_EFFECT", fieldErrors: [] };
    const { calls, callApi } = recording(answer);

    const result = await cancelAgreement("A1", body, { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/v1/staff/brokerage-agreements/{agreementId}/cancellation",
        options: { params: { path: { agreementId: "A1" } }, body },
      },
    ]);
  });
});
