import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { AgreementListings, ListingCreated, ListingDetail } from "../types";

import { createListing, getAgreementListings, getListing } from "./listing-api";

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

const AGREEMENT_ID = "01JF000000000000000000000A";
const LISTING_ID = "01JG000000000000000000000L";

describe("listing calls (listing-publish E06-S1, spec section 6)", () => {
  it("listingApi_create_postsTheAgreementId: one POST of the agreement id only, its answer returned as it is", async () => {
    const answer: ApiResult<ListingCreated> = {
      ok: true,
      status: 201,
      replayed: false,
      data: { listingId: LISTING_ID, code: "TD-7K3M-Q9TX" },
    };
    const { calls, callApi } = recording(answer);

    const result = await createListing(AGREEMENT_ID, { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([{ method: "POST", path: "/api/v1/staff/listings", options: { body: { agreementId: AGREEMENT_ID } } }]);
  });

  it("listingApi_reads_getTheirPaths: the listing read and the agreement's listings read each GET their path with the id", async () => {
    const detail: ApiResult<ListingDetail> = { ok: false, kind: "http", status: 404, code: "NOT_FOUND", fieldErrors: [] };
    const listing = recording(detail);

    expect(await getListing(LISTING_ID, { callApi: listing.callApi as never })).toBe(detail);
    expect(listing.calls).toEqual([
      { method: "GET", path: "/api/v1/staff/listings/{listingId}", options: { params: { path: { listingId: LISTING_ID } } } },
    ]);

    const section: ApiResult<AgreementListings> = { ok: false, kind: "network" };
    const agreement = recording(section);

    expect(await getAgreementListings(AGREEMENT_ID, { callApi: agreement.callApi as never })).toBe(section);
    expect(agreement.calls).toEqual([
      {
        method: "GET",
        path: "/api/v1/staff/listings/by-agreement/{agreementId}",
        options: { params: { path: { agreementId: AGREEMENT_ID } } },
      },
    ]);
  });
});
