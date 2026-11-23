import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingLiveDifference, ListingPublication, ListingRevisionChange } from "../types";

import { getListingPublication, getListingRevisionLiveDifference, putListingRevisionLive } from "./publication-api";

/** A fake `callApi` that runs the request against a client recording each call, and answers `answer` as it is. */
function recording<T>(answer: ApiResult<T>) {
  const calls: { method: string; path: string; options: unknown }[] = [];
  const record = (method: string) => (path: string, options: unknown) => {
    calls.push({ method, path, options });
    return Promise.resolve();
  };
  const client = { GET: record("GET"), POST: record("POST"), PUT: record("PUT") };
  const callApi = vi.fn(async (run: (c: never) => unknown) => {
    await run(client as never);
    return answer as never;
  });
  return { calls, callApi };
}

const LISTING_ID = "01JG000000000000000000000L";

const PUBLICATION: ApiResult<ListingPublication> = {
  ok: true,
  status: 200,
  replayed: false,
  data: {
    listingId: LISTING_ID,
    state: "UNPUBLISHED",
    dataVersion: 7,
    live: null,
    approved: { revisionNo: 2, termsSource: "IN_EFFECT", display: { holds: false, reasons: ["FRESHNESS"], reasonGroups: [] } },
    viewerMayPutLive: true,
    viewerMayCopy: true,
  },
};

const LIVE: ApiResult<ListingRevisionChange> = {
  ok: true,
  status: 200,
  replayed: false,
  data: { listingId: LISTING_ID, revisionNo: 2, status: "LIVE", dataVersion: 8 },
};

const DIFFERENCE: ApiResult<ListingLiveDifference> = {
  ok: true,
  status: 200,
  replayed: false,
  data: { revisionNo: 3, comparison: "NO_LIVE_REVISION", live: null, changedParts: [] },
};

describe("publication calls (listing-publish E06-S6, spec sections 4.1 to 4.3, U-1)", () => {
  it("publicationApi_threeCalls_pathsMethodsAndBodies: the publication read, the put live and the live difference each send their method and schema path once, the revision number as text, and exactly their options", async () => {
    const read = recording(PUBLICATION);
    expect(await getListingPublication(LISTING_ID, { callApi: read.callApi as never })).toBe(PUBLICATION);
    expect(read.callApi).toHaveBeenCalledTimes(1);
    expect(read.calls).toStrictEqual([
      { method: "GET", path: "/api/v1/staff/listings/{listingId}/publication", options: { params: { path: { listingId: LISTING_ID } } } },
    ]);

    const put = recording(LIVE);
    expect(await putListingRevisionLive(LISTING_ID, 2, 7, { callApi: put.callApi as never })).toBe(LIVE);
    expect(put.callApi).toHaveBeenCalledTimes(1);
    expect(put.calls).toStrictEqual([
      {
        method: "POST",
        path: "/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/publication",
        options: { params: { path: { listingId: LISTING_ID, revisionNo: "2" } }, body: { dataVersion: 7 } },
      },
    ]);

    const difference = recording(DIFFERENCE);
    expect(await getListingRevisionLiveDifference(LISTING_ID, 3, { callApi: difference.callApi as never })).toBe(DIFFERENCE);
    expect(difference.callApi).toHaveBeenCalledTimes(1);
    expect(difference.calls).toStrictEqual([
      {
        method: "GET",
        path: "/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/live-difference",
        options: { params: { path: { listingId: LISTING_ID, revisionNo: "3" } } },
      },
    ]);
  });

  it("publicationApi_failure_passedThrough: a refusal with its entries and no answer come back as they are", async () => {
    const refusal: ApiResult<ListingRevisionChange> = {
      ok: false,
      kind: "http",
      status: 409,
      code: "PUT_LIVE_REFUSED",
      fieldErrors: [{ field: "reasons.FRESHNESS", message: "This reason stops the put live." }],
    };
    const put = recording(refusal);
    expect(await putListingRevisionLive(LISTING_ID, 2, 7, { callApi: put.callApi as never })).toBe(refusal);

    const network: ApiResult<ListingPublication> = { ok: false, kind: "network" };
    const read = recording(network);
    expect(await getListingPublication(LISTING_ID, { callApi: read.callApi as never })).toBe(network);
  });
});
