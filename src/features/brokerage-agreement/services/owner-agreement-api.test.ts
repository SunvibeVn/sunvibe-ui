import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type {
  BrokerageAgreementConfirmationRequest,
  BrokerageAgreementOwnerList,
  BrokerageAgreementRejectionRequest,
} from "../types";

import { confirmVersions, listMine, rejectVersion } from "./owner-agreement-api";

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

describe("the owner's agreement calls (brokerage-agreement E05-S5, S5-D1, S5-D5, S5-D7)", () => {
  it("ownerAgreementApi_listMine_getsTheOwnerList: one GET of the account's agreements through callApi, its answer returned as it is", async () => {
    const answer: ApiResult<BrokerageAgreementOwnerList> = {
      ok: true,
      data: { items: [], more: false },
      status: 200,
      replayed: false,
    };
    const { calls, callApi } = recording(answer);

    const result = await listMine({ callApi: callApi as never });

    expect(result).toBe(answer);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([{ method: "GET", path: "/api/v1/me/brokerage-agreements", options: undefined }]);
  });

  it("ownerAgreementApi_confirmVersions_postsOneBody: one POST of the password, the statement version and every version, its answer returned as it is", async () => {
    const body: BrokerageAgreementConfirmationRequest = {
      currentPassword: "secret-1",
      statementVersion: "brokerage-agreement-2026-11",
      versions: [
        { agreementId: "A1", versionNo: 1 },
        { agreementId: "A2", versionNo: 2 },
      ],
    };
    const answer: ApiResult<undefined> = { ok: true, data: undefined, status: 204, replayed: false };
    const { calls, callApi } = recording(answer);

    const result = await confirmVersions(body, { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([{ method: "POST", path: "/api/v1/me/brokerage-agreements/confirmations", options: { body } }]);
  });

  it("ownerAgreementApi_rejectVersion_postsVersionAndReason: one POST of the version number and the reason to the agreement's rejection path", async () => {
    const body: BrokerageAgreementRejectionRequest = { versionNo: 1, reason: "The rent is too low." };
    const answer: ApiResult<undefined> = { ok: false, kind: "http", status: 409, code: "AGREEMENT_NOT_AWAITING_OWNER", fieldErrors: [] };
    const { calls, callApi } = recording(answer);

    const result = await rejectVersion("A1", body, { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/v1/me/brokerage-agreements/{agreementId}/rejection",
        options: { params: { path: { agreementId: "A1" } }, body },
      },
    ]);
  });
});
