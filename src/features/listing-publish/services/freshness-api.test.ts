import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingFreshnessRecordRequest } from "../types";

import { getListingFreshness, getListingReconfirmations, recordListingFreshness } from "./freshness-api";

/** A fake `callApi` that runs the request against a client recording each call, and answers `answer` as it is. */
function recording(answer: ApiResult<unknown>) {
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

const LISTING_ID = "01JG000000000000000000000L";

/** The request of the handoff's example: no date, the server sets it. */
const BODY: ListingFreshnessRecordRequest = {
  dataVersion: 4,
  channel: "CALL",
  outcome: "AVAILABLE",
  termsStillApply: true,
  unitUnchanged: true,
  note: "Chủ xác nhận còn trống.",
};

describe("freshness calls (listing-publish E06-S3, spec section 4, E06S3-D1)", () => {
  it("freshnessApi_calls_theirPathsAndBodies: the freshness read, the record and the reconfirmation list each send their method and path once, the record exactly its body", async () => {
    const { calls, callApi } = recording({ ok: false, kind: "network" });
    const deps = { callApi: callApi as never };

    await getListingFreshness(LISTING_ID, deps);
    await recordListingFreshness(LISTING_ID, BODY, deps);
    await getListingReconfirmations(deps);

    expect(calls).toEqual([
      { method: "GET", path: "/api/v1/staff/listings/{listingId}/freshness", options: { params: { path: { listingId: LISTING_ID } } } },
      {
        method: "POST",
        path: "/api/v1/staff/listings/{listingId}/freshness-records",
        options: { params: { path: { listingId: LISTING_ID } }, body: BODY },
      },
      { method: "GET", path: "/api/v1/staff/listings/reconfirmations", options: undefined },
    ]);
  });
});
