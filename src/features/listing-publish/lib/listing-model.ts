import type { ApiResult } from "@/features/auth/client";
import { BROKERAGE_AGREEMENTS_PATH, LISTINGS_PATH } from "@/features/workspace";

import type { ListingDetail } from "../types";

import {
  listingStateKey,
  revisionStatusKey,
  transactionTypeKey,
  type ListingStateKey,
  type RevisionStatusKey,
  type TransactionTypeKey,
} from "./listing-text";
import { type RevisionPanelInput, revisionPanelOf } from "./revision-model";

/** One revision as the page lists it (listing-publish US-1 AC-4): its number, its status and when it was created. */
export type ListingRevisionLine = { revisionNo: number; statusKey: RevisionStatusKey; createdAt: string };

/**
 * The listing page (spec section 6, UL-3). `hidden`: the session screens answer (signed out or unavailable), so the
 * page shows nothing (E06S1-P8). No unit address, owner or person is in it.
 */
export type ListingPageModel =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "not-found" }
  | { kind: "error" }
  | {
      kind: "ready";
      code: string;
      stateKey: ListingStateKey;
      transactionKey: TransactionTypeKey;
      createdAt: string;
      agreementHref: string;
      /** At most the 20 newest, newest first, as the server answers them (E06S1-D17). */
      revisions: ListingRevisionLine[];
      olderRevisions: boolean;
      /** What the "Current revision" panel reads from the listing (listing-publish E06-S2, E06S2-D20). */
      revisionPanel: RevisionPanelInput;
    };

/** The page of one listing in the workspace. */
export function listingPath(listingId: string): string {
  return `${LISTINGS_PATH}/${encodeURIComponent(listingId)}`;
}

/**
 * The page's model from the listing read: a 404 (unknown, malformed or out of the caller's scope, one answer for all
 * three) is "not found"; the session answers hide the page; any other failure is an error with "Try again".
 */
export function listingModel(result: ApiResult<ListingDetail>): ListingPageModel {
  if (result.ok) {
    const listing = result.data;
    return {
      kind: "ready",
      code: listing.code,
      stateKey: listingStateKey(listing.state),
      transactionKey: transactionTypeKey(listing.transactionType),
      createdAt: listing.createdAt,
      agreementHref: `${BROKERAGE_AGREEMENTS_PATH}/${encodeURIComponent(listing.agreementId)}`,
      revisions: listing.revisions.map((revision) => ({
        revisionNo: revision.revisionNo,
        statusKey: revisionStatusKey(revision.status),
        createdAt: revision.createdAt,
      })),
      olderRevisions: listing.hasOlderRevisions,
      revisionPanel: revisionPanelOf(listing),
    };
  }
  switch (result.kind) {
    case "signed-out":
    case "unavailable":
      return { kind: "hidden" };
    case "network":
      return { kind: "error" };
    case "http":
      return result.status === 404 ? { kind: "not-found" } : { kind: "error" };
  }
}
