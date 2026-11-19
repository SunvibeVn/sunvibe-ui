import { callApi, type ApiResult, type CallApi } from "@/features/auth/client";

import type { AgreementListings, ListingCreated, ListingDetail } from "../types";

export type ListingDeps = { callApi: CallApi };

const DEFAULT_DEPS: ListingDeps = { callApi };

/**
 * POST a listing for the agreement (listing-publish US-1 AC-1): the body names the agreement only; the unit, the type,
 * the code and the creator come from the server (E06S1-D2, D3).
 */
export function createListing(agreementId: string, deps: ListingDeps = DEFAULT_DEPS): Promise<ApiResult<ListingCreated>> {
  return deps.callApi((client) => client.POST("/api/v1/staff/listings", { body: { agreementId } }));
}

/** GET one listing with its newest revisions (listing-publish US-1 AC-4). */
export function getListing(listingId: string, deps: ListingDeps = DEFAULT_DEPS): Promise<ApiResult<ListingDetail>> {
  return deps.callApi((client) => client.GET("/api/v1/staff/listings/{listingId}", { params: { path: { listingId } } }));
}

/** GET the listings of an agreement and whether the caller may create one now (E06S1-D1). */
export function getAgreementListings(
  agreementId: string,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<AgreementListings>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/listings/by-agreement/{agreementId}", { params: { path: { agreementId } } }),
  );
}
