import { callApi, type ApiResult } from "@/features/auth/client";

import type { ListingFreshness, ListingFreshnessRecorded, ListingFreshnessRecordRequest, ListingReconfirmations } from "../types";

import type { ListingDeps } from "./listing-api";

const DEFAULT_DEPS: ListingDeps = { callApi };

// The three staff calls of a listing's freshness (listing-publish E06-S3, E06S3-D1). The record carries the listing's
// data version the page read (listing BR-3) and no date: the server sets today in Vietnam time (E06S3-D4).

/** GET the listing's freshness: the dates, the flags and the latest record with its private note (E06S3-D8). */
export function getListingFreshness(listingId: string, deps: ListingDeps = DEFAULT_DEPS): Promise<ApiResult<ListingFreshness>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/listings/{listingId}/freshness", { params: { path: { listingId } } }),
  );
}

/** POST one contact with the person letting the unit (listing-publish US-6 AC-1); the server decides it. */
export function recordListingFreshness(
  listingId: string,
  body: ListingFreshnessRecordRequest,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingFreshnessRecorded>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/listings/{listingId}/freshness-records", { params: { path: { listingId } }, body }),
  );
}

/** GET the listings to reconfirm in the caller's scope, oldest confirmation first (listing-publish US-6 AC-3). */
export function getListingReconfirmations(deps: ListingDeps = DEFAULT_DEPS): Promise<ApiResult<ListingReconfirmations>> {
  return deps.callApi((client) => client.GET("/api/v1/staff/listings/reconfirmations"));
}
