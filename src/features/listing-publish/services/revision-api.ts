import { callApi, type ApiResult } from "@/features/auth/client";

import type {
  ListingRevisionChange,
  ListingRevisionContentBody,
  ListingRevisionDetail,
  ListingTermsSources,
} from "../types";

import type { ListingDeps } from "./listing-api";

const DEFAULT_DEPS: ListingDeps = { callApi };

// The seven staff calls of a listing's revisions (listing-publish E06-S2, E06S2-D1). The revision number travels as
// text: the server reads 1 to 9 digits without a leading zero and answers its one 404 for anything else. Every command
// carries the listing's data version the page read (listing BR-3); the server decides every command.

/** GET one revision with the problems a Draft's submission would answer now (E06S2-D14). */
export function getListingRevision(
  listingId: string,
  revisionNo: number,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingRevisionDetail>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
    }),
  );
}

/** POST a new empty Draft, numbered after the greatest (listing-publish US-2 AC-6). */
export function startListingRevision(
  listingId: string,
  dataVersion: number,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingRevisionChange>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/listings/{listingId}/revisions", {
      params: { path: { listingId } },
      body: { dataVersion },
    }),
  );
}

/** PUT a Draft's title, description and features as a whole (listing-publish US-2 AC-1, AC-3). */
export function saveListingRevisionContent(
  listingId: string,
  revisionNo: number,
  body: ListingRevisionContentBody,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingRevisionChange>> {
  return deps.callApi((client) =>
    client.PUT("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/content", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
      body,
    }),
  );
}

/** PUT a terms snapshot of the chosen source; the body names the source only, never an amount (US-2 AC-2). */
export function captureListingRevisionTerms(
  listingId: string,
  revisionNo: number,
  dataVersion: number,
  source: "IN_EFFECT" | "PENDING_START",
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingRevisionChange>> {
  return deps.callApi((client) =>
    client.PUT("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/terms", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
      body: { dataVersion, source },
    }),
  );
}

/** POST the submission of a Draft for review (listing-publish US-2 AC-4, AC-5). */
export function submitListingRevision(
  listingId: string,
  revisionNo: number,
  dataVersion: number,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingRevisionChange>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/submission", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
      body: { dataVersion },
    }),
  );
}

/** POST the withdrawal of a Pending review revision before a decision (listing-publish US-2 AC-5). */
export function withdrawListingRevision(
  listingId: string,
  revisionNo: number,
  dataVersion: number,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingRevisionChange>> {
  return deps.callApi((client) =>
    client.POST("/api/v1/staff/listings/{listingId}/revisions/{revisionNo}/withdrawal", {
      params: { path: { listingId, revisionNo: String(revisionNo) } },
      body: { dataVersion },
    }),
  );
}

/** GET the terms a snapshot can be taken from now, for the assigned Sale only (E06S2-D2, D14). */
export function getListingTermsSources(
  listingId: string,
  deps: ListingDeps = DEFAULT_DEPS,
): Promise<ApiResult<ListingTermsSources>> {
  return deps.callApi((client) =>
    client.GET("/api/v1/staff/listings/{listingId}/terms-sources", { params: { path: { listingId } } }),
  );
}
