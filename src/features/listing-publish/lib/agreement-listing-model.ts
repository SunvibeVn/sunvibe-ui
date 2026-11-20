import type { ApiResult } from "@/features/auth/client";

import type { AgreementListings, ListingItem } from "../types";

import { listingStateKey, reasonGroupKey, type ListingStateKey, type ReasonGroupKey } from "./listing-text";

/** One listing of the agreement as the section lists it: "Listing {code}", its state and "Open". */
export type ListingLine = { listingId: string; code: string; stateKey: ListingStateKey };

/**
 * The "Listing" section of the agreement page (spec section 6, UL-1). `hidden`: a 404 (the agreement cannot be read by
 * this caller) or a session answer (the session screens answer, E06S1-P8), so the section shows nothing.
 */
export type AgreementListingModel =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "error" }
  | {
      kind: "ready";
      /** The listing whose state is not Archived; the answer holds at most one (E06S1-D4). */
      open: ListingLine | null;
      /** The archived listings, newest first, listed in every case. */
      archived: ListingLine[];
      /** Without an open listing: no listing at all, or archived ones only. */
      emptyLine: "section.noListing" | "section.noOpenListing" | null;
      /** "Create a listing", with the not-started line when E05's groups are exactly [NOT_STARTED]. */
      offer: { notStarted: boolean } | null;
      /** One line per group that stops a create, in E05's order. */
      refusals: ReasonGroupKey[];
      /** "Only the lead's assigned Sale creates a listing.": no offer and no group. */
      assignedSaleOnly: boolean;
      /** "Older listings of this agreement are not shown here." (E06S1-D17). */
      older: boolean;
    };

const lineOf = (listing: ListingItem): ListingLine => ({
  listingId: listing.listingId,
  code: listing.code,
  stateKey: listingStateKey(listing.state),
});

/**
 * The section's model from the agreement's listings read. The creation part is a hint (listing-publish US-1 AC-1,
 * E06S1-D3): the server decides at the create. With an open listing there is no create action and no line about one.
 */
export function agreementListingModel(result: ApiResult<AgreementListings>): AgreementListingModel {
  if (result.ok) {
    const { listings, hasOlder, creation } = result.data;
    const open = listings.find((listing) => listing.state !== "ARCHIVED");
    const archived = listings.filter((listing) => listing.state === "ARCHIVED").map(lineOf);
    if (open !== undefined) {
      return {
        kind: "ready",
        open: lineOf(open),
        archived,
        emptyLine: null,
        offer: null,
        refusals: [],
        assignedSaleOnly: false,
        older: hasOlder,
      };
    }
    const refusals = creation.viewerMayCreate ? [] : creation.reasonGroups.map(reasonGroupKey);
    return {
      kind: "ready",
      open: null,
      archived,
      emptyLine: listings.length === 0 ? "section.noListing" : "section.noOpenListing",
      offer: creation.viewerMayCreate ? { notStarted: creation.advertisingNotStarted } : null,
      refusals,
      assignedSaleOnly: !creation.viewerMayCreate && refusals.length === 0,
      older: hasOlder,
    };
  }
  switch (result.kind) {
    case "signed-out":
    case "unavailable":
      return { kind: "hidden" };
    case "network":
      return { kind: "error" };
    case "http":
      return result.status === 404 ? { kind: "hidden" } : { kind: "error" };
  }
}
