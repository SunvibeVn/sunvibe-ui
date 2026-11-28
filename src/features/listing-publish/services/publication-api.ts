import { callApi, type ApiResult } from "@/features/auth/client";

import type { ListingLiveDifference, ListingPublication, ListingPublicPreview, ListingRevisionChange } from "../types";

import type { ListingDeps } from "./listing-api";

const DEFAULT_DEPS: ListingDeps = { callApi };

// The three staff calls of putting a revision live (listing-publish E06-S6, spec sections 4.1 to 4.3) and the preview of
// a revision's public data (E06-S7, spec section 4.2). The revision
// number travels as text, as the revision calls send it; the server answers its one 404 for anything it does not read.
// The put live carries the listing's data version the publication read answered (listing BR-3); the server decides it.

/** GET the live revision and the Approved one waiting, each with whether its display conditions hold now (E06S6-D11). */
export function getListingPublication(listingId: string, deps: ListingDeps = DEFAULT_DEPS): Promise<ApiResult<ListingPublication>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/listings/{listingId}/publication", { params: { path: { listingId } } }),
  );
}

/** POST the Sale's "Put live" of an Approved revision; it goes live only when every display condition holds now. */
export function putListingRevisionLive(
  listingId: string,
  revisionNo: number,
  dataVersion: number,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingRevisionChange>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/publication", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
      body: { dataVersion },
    }),
  );
}

/** GET what a revision changes against the live revision: title, description, features and terms by value (E06S6-D12). */
export function getListingRevisionLiveDifference(
  listingId: string,
  revisionNo: number,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingLiveDifference>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/live-difference", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
    }),
  );
}

/**
 * GET a revision's public data as it would be published (listing-publish US-2 AC-3, E06-S7, E06S7-D9): the groups of
 * BR-14 from the revision itself, with its unit snapshot's place names. It computes no display condition, so a 200
 * does not mean the data is or will be public.
 */
export function getListingRevisionPublicPreview(
  listingId: string,
  revisionNo: number,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingPublicPreview>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/public-preview", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
    }),
  );
}
