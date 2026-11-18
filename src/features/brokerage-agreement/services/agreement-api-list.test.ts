import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementHistory, BrokerageAgreementPage } from "../types";

import { getAgreementHistory, listAgreements } from "./agreement-api";

/** A fake `callApi` that runs the request against a client recording each `GET`, and answers `answer` as it is. */
function recording<T>(answer: ApiResult<T>) {
  const calls: { method: string; path: string; options: unknown }[] = [];
  const client = {
    GET: (path: string, options: unknown) => {
      calls.push({ method: "GET", path, options });
      return Promise.resolve();
    },
  };
  const callApi = vi.fn(async (run: (c: never) => unknown) => {
    await run(client as never);
    return answer as never;
  });
  return { calls, callApi };
}

describe("agreement list and history calls (brokerage-agreement E05-S7, S7-D1, S7-D7)", () => {
  it("agreementApi_listAgreements_getsTheQuery: one GET of the collection path with the query as given, status an array", async () => {
    const answer: ApiResult<BrokerageAgreementPage> = {
      ok: true,
      data: { items: [], page: 0, size: 20, totalElements: 0 },
      status: 200,
      replayed: false,
    };
    const { calls, callApi } = recording(answer);
    const query = { status: ["ACTIVE" as const], endsWithin30Days: true, page: 2, size: 20 };

    const result = await listAgreements(query, { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        method: "GET",
        path: "/api/v1/staff/brokerage-agreements",
        options: { params: { query: { status: ["ACTIVE"], endsWithin30Days: true, page: 2, size: 20 } } },
      },
    ]);
  });

  it("agreementApi_getAgreementHistory_getsThePageOfTheAgreement: one GET of the history path of the agreement with its page and size", async () => {
    const answer: ApiResult<BrokerageAgreementHistory> = { ok: false, kind: "http", status: 404, fieldErrors: [] };
    const { calls, callApi } = recording(answer);

    const result = await getAgreementHistory("A1", { page: 1, size: 50 }, { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        method: "GET",
        path: "/api/v1/staff/brokerage-agreements/{agreementId}/history",
        options: { params: { path: { agreementId: "A1" }, query: { page: 1, size: 50 } } },
      },
    ]);
  });
});
