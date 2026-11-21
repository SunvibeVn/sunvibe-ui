import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingRevisionChange, ListingRevisionDecisionRequest } from "../types";

import {
  copyListingRevision,
  decideListingRevision,
  getListingReviewQueue,
  getListingRevisionDecision,
  getListingRevisionReview,
  openListingUnitLocation,
} from "./review-api";

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
  data: { listingId: LISTING_ID, revisionNo: 3, status: "NEEDS_CHANGES", dataVersion: 8 },
};

/** The handoff's return example: only the chosen outcome's fields. */
const RETURN: ListingRevisionDecisionRequest = {
  dataVersion: 7,
  outcome: "NEEDS_CHANGES",
  changeReasons: ["MISSING_INFORMATION"],
  note: "Thiếu diện tích.",
};

const path = { listingId: LISTING_ID, revisionNo: "3" };

describe("review calls (listing-publish E06-S4, spec section 4, E06S4-D1)", () => {
  it("reviewApi_calls_pathsMethodsAndBodies: each of the six calls sends its method and path once, the revision number as text and exactly its body", async () => {
    const cases: { send: (deps: { callApi: never }) => Promise<unknown>; expected: { method: string; path: string; options: unknown } }[] = [
      {
        send: (deps) => getListingReviewQueue(deps),
        expected: { method: "GET", path: "/api/v1/staff/listings/review-queue", options: undefined },
      },
      {
        send: (deps) => getListingRevisionReview(LISTING_ID, 3, deps),
        expected: {
          method: "GET",
          path: "/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/review",
          options: { params: { path } },
        },
      },
      {
        send: (deps) => decideListingRevision(LISTING_ID, 3, RETURN, deps),
        expected: {
          method: "POST",
          path: "/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/decision",
          options: { params: { path }, body: RETURN },
        },
      },
      {
        send: (deps) => getListingRevisionDecision(LISTING_ID, 3, deps),
        expected: {
          method: "GET",
          path: "/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/decision",
          options: { params: { path } },
        },
      },
      {
        send: (deps) => openListingUnitLocation(LISTING_ID, 3, deps),
        expected: {
          method: "POST",
          path: "/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/unit-location",
          options: { params: { path } },
        },
      },
      {
        send: (deps) => copyListingRevision(LISTING_ID, 3, 7, deps),
        expected: {
          method: "POST",
          path: "/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/copies",
          options: { params: { path }, body: { dataVersion: 7 } },
        },
      },
    ];

    for (const { send, expected } of cases) {
      const { calls, callApi } = recording(CHANGE);
      expect(await send({ callApi: callApi as never })).toBe(CHANGE);
      expect(callApi).toHaveBeenCalledTimes(1);
      expect(calls).toEqual([expected]);
    }
  });

  it("reviewApi_failure_passedThrough: a refusal and no answer come back as they are", async () => {
    const refusal: ApiResult<ListingRevisionChange> = {
      ok: false,
      kind: "http",
      status: 403,
      code: "REVIEWER_NOT_INDEPENDENT",
      fieldErrors: [{ field: "reasons.AUTHOR", message: "Fixed server message." }],
    };
    const decide = recording(refusal);
    expect(await decideListingRevision(LISTING_ID, 1, RETURN, { callApi: decide.callApi as never })).toBe(refusal);

    const network: ApiResult<ListingRevisionChange> = { ok: false, kind: "network" };
    const copy = recording(network);
    expect(await copyListingRevision(LISTING_ID, 1, 4, { callApi: copy.callApi as never })).toBe(network);
  });
});
