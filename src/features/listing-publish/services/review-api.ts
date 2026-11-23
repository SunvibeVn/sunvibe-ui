import { callApi, type ApiResult } from "@/features/auth/client";

import type {
  ListingReviewQueue,
  ListingRevisionChange,
  ListingRevisionDecision,
  ListingRevisionDecisionRequest,
  ListingRevisionReview,
  ListingUnitLocation,
} from "../types";

import type { ListingDeps } from "./listing-api";

const DEFAULT_DEPS: ListingDeps = { callApi };

// The six staff calls of the independent review (listing-publish E06-S4, E06S4-D1). The revision number travels as text,
// as the revision calls send it (E06-S2); the server answers its one 404 for anything it does not read. Every command
// carries the listing's data version the page read (listing BR-3); the server decides every call.

/** GET the Pending review revisions, oldest submission first, with whether the caller may review each (US-4 AC-1). */
export function getListingReviewQueue(deps: ListingDeps = DEFAULT_DEPS): Promise<ApiResult<ListingReviewQueue>> {
  return deps.callApi((client) => client.GET("/api/v1/staff/listings/review-queue"));
}

/** GET what a reviewer reads beside a revision: eligibility, E05's answer, the terms check, the unit, the freshness. */
export function getListingRevisionReview(
  listingId: string,
  revisionNo: number,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingRevisionReview>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/review", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
    }),
  );
}

/** POST the decision of a Pending review revision: approve, return for changes or reject (US-4 AC-3 to AC-5). */
export function decideListingRevision(
  listingId: string,
  revisionNo: number,
  body: ListingRevisionDecisionRequest,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingRevisionChange>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/decision", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
      body,
    }),
  );
}

/** GET a revision's decision with its reasons and note; no reviewer id (US-4 AC-6). */
export function getListingRevisionDecision(
  listingId: string,
  revisionNo: number,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingRevisionDecision>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/decision", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
    }),
  );
}

/** POST the opening of the unit's real location; the server logs each opening (E06S4-D12). No body. */
export function openListingUnitLocation(
  listingId: string,
  revisionNo: number,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingUnitLocation>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/unit-location", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
    }),
  );
}

/** POST a copy of a Needs changes revision into a new Draft (listing-publish US-2 AC-6, E06S4-D14). */
export function copyListingRevision(
  listingId: string,
  revisionNo: number,
  dataVersion: number,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingRevisionChange>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/copies", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
      body: { dataVersion },
    }),
  );
}
