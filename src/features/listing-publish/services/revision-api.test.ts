import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange, ListingRevisionContentBody, ListingRevisionDetail, ListingTermsSources } from "../types";

import {
  captureListingRevisionTerms,
  getListingRevision,
  getListingTermsSources,
  saveListingRevisionContent,
  startListingRevision,
  submitListingRevision,
  withdrawListingRevision,
} from "./revision-api";

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

const CHANGE: ApiResult<ListingRevisionChange> = {
  ok: true,
  status: 200,
  replayed: false,
  data: { listingId: LISTING_ID, revisionNo: 3, status: "DRAFT", dataVersion: 8 },
};

/** The content body of the handoff's example. */
const CONTENT: ListingRevisionContentBody = {
  dataVersion: 7,
  title: "Phòng trọ gần trường",
  description: null,
  features: {
    furnishing: "BASIC",
    airConditioner: true,
    waterHeater: false,
    fridge: false,
    washingMachine: null,
    kitchen: "PRIVATE",
    balcony: false,
    elevator: false,
    motorbikeParking: true,
    carParking: false,
    internet: true,
    pets: null,
    noSharedLandlord: true,
  },
};

const path = (revisionNo?: string) =>
  revisionNo === undefined ? { listingId: LISTING_ID } : { listingId: LISTING_ID, revisionNo };

describe("revision calls (listing-publish E06-S2, spec section 4, E06S2-D1)", () => {
  it("revisionApi_eachCall_pathMethodAndBody: each of the seven calls sends its method and path once, the revision number as text and exactly its body", async () => {
    const cases: { send: (deps: { callApi: never }) => Promise<unknown>; expected: { method: string; path: string; options: unknown } }[] = [
      {
        send: (deps) => getListingRevision(LISTING_ID, 3, deps),
        expected: {
          method: "GET",
          path: "/api/v1/staff/listings/{listingId}/revisions/{revisionNo}",
          options: { params: { path: path("3") } },
        },
      },
      {
        send: (deps) => startListingRevision(LISTING_ID, 7, deps),
        expected: {
          method: "POST",
          path: "/api/v1/staff/listings/{listingId}/revisions",
          options: { params: { path: path() }, body: { dataVersion: 7 } },
        },
      },
      {
        send: (deps) => saveListingRevisionContent(LISTING_ID, 3, CONTENT, deps),
        expected: {
          method: "PUT",
          path: "/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/content",
          options: { params: { path: path("3") }, body: CONTENT },
        },
      },
      {
        send: (deps) => captureListingRevisionTerms(LISTING_ID, 3, 7, "PENDING_START", deps),
        expected: {
          method: "PUT",
          path: "/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/terms",
          options: { params: { path: path("3") }, body: { dataVersion: 7, source: "PENDING_START" } },
        },
      },
      {
        send: (deps) => submitListingRevision(LISTING_ID, 3, 7, deps),
        expected: {
          method: "POST",
          path: "/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/submission",
          options: { params: { path: path("3") }, body: { dataVersion: 7 } },
        },
      },
      {
        send: (deps) => withdrawListingRevision(LISTING_ID, 3, 7, deps),
        expected: {
          method: "POST",
          path: "/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/withdrawal",
          options: { params: { path: path("3") }, body: { dataVersion: 7 } },
        },
      },
      {
        send: (deps) => getListingTermsSources(LISTING_ID, deps),
        expected: {
          method: "GET",
          path: "/api/v1/staff/listings/{listingId}/terms-sources",
          options: { params: { path: path() } },
        },
      },
    ];

    for (const { send, expected } of cases) {
      const { calls, callApi } = recording(CHANGE);
      expect(await send({ callApi: callApi as never })).toBe(CHANGE);
      expect(callApi).toHaveBeenCalledTimes(1);
      expect(calls).toEqual([expected]);
    }
    // The content body is sent as given: the form builds it (revision-form.ts), the call adds nothing.
    expect(Object.keys(CONTENT).sort()).toEqual(["dataVersion", "description", "features", "title"]);
  });

  it("revisionApi_failure_passedThrough: a refusal, no answer and a session answer come back as they are", async () => {
    const refusal: ApiResult<ListingRevisionDetail> = { ok: false, kind: "http", status: 404, code: "NOT_FOUND", fieldErrors: [] };
    const read = recording(refusal);
    expect(await getListingRevision(LISTING_ID, 1, { callApi: read.callApi as never })).toBe(refusal);

    const network: ApiResult<ListingTermsSources> = { ok: false, kind: "network" };
    const sources = recording(network);
    expect(await getListingTermsSources(LISTING_ID, { callApi: sources.callApi as never })).toBe(network);

    const unprocessable: ApiResult<ListingRevisionChange> = {
      ok: false,
      kind: "http",
      status: 422,
      code: "REVISION_NOT_SUBMITTABLE",
      fieldErrors: [{ field: "description.PHONE_NUMBER", message: "Holds what reads as a phone number." }],
    };
    const submit = recording(unprocessable);
    expect(await submitListingRevision(LISTING_ID, 1, 4, { callApi: submit.callApi as never })).toBe(unprocessable);

    const signedOut: ApiResult<ListingRevisionChange> = { ok: false, kind: "signed-out" };
    const start = recording(signedOut);
    expect(await startListingRevision(LISTING_ID, 4, { callApi: start.callApi as never })).toBe(signedOut);
  });
});
