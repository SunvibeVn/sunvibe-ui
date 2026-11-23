import type { ApiResult } from "@/features/auth/client";

import type { ListingReviewQueue, ListingUnitSnapshot } from "../types";

import { listingPath } from "./listing-model";
import { ineligibilityKey } from "./review-text";
import { assetTypeKey, type ListingKey, type Phrase } from "./revision-text";

/** One Pending review revision of the queue; the title is content, shown as text only (E06S4-D17). */
export type ReviewQueueRow = {
  listingId: string;
  code: string;
  revisionNo: number;
  submittedAt: string;
  title: string;
  /** The unit at submission, as one line of parts: type, ward and province, rooms, area. */
  unitLine: Phrase[];
  /** The review page, only where the viewer may review the revision; the server decides again. */
  reviewHref: string | null;
  /** Why the viewer may not review it, one sentence each, in the server's order. */
  reasonKeys: ListingKey[];
};

/**
 * "Listing reviews" (spec section 6, E06S4-D10, D17). `forbidden`: the 403 of a role the queue does not admit;
 * `hidden`: a session answer; `empty`: nothing waits and nothing more; `ready`: the rows, oldest submission first, and
 * whether more are waiting (the rows may be none when every candidate read was left out).
 */
export type ReviewQueueModel =
  | { kind: "hidden" }
  | { kind: "error" }
  | { kind: "forbidden" }
  | { kind: "empty" }
  | { kind: "ready"; rows: ReviewQueueRow[]; hasMore: boolean };

/** The review page of one revision in the workspace. */
export function reviewPath(listingId: string, revisionNo: number): string {
  return `${listingPath(listingId)}/revisions/${revisionNo}/review`;
}

/** The unit at submission in one line: its type, its catalog ward and province when both are set, its rooms and area. */
function unitLine(unit: ListingUnitSnapshot): Phrase[] {
  const parts: Phrase[] = [];
  if (unit.assetType !== null) parts.push({ key: assetTypeKey(unit.assetType) });
  if (unit.wardName !== null && unit.provinceName !== null) {
    parts.push({ key: "revision.unit.place", values: { ward: unit.wardName, province: unit.provinceName } });
  }
  parts.push({ key: "revision.unit.rooms", values: { bedrooms: unit.bedrooms, bathrooms: unit.bathrooms } });
  parts.push({ key: "revision.unit.area", values: { area: unit.areaSqm } });
  return parts;
}

export function reviewQueueModel(result: ApiResult<ListingReviewQueue>): ReviewQueueModel {
  if (result.ok) {
    const { items, hasMore } = result.data;
    if (items.length === 0 && !hasMore) return { kind: "empty" };
    return {
      kind: "ready",
      rows: items.map((item) => ({
        listingId: item.listingId,
        code: item.code,
        revisionNo: item.revisionNo,
        submittedAt: item.submittedAt,
        title: item.title,
        unitLine: unitLine(item.unit),
        reviewHref: item.viewerMayReview ? reviewPath(item.listingId, item.revisionNo) : null,
        reasonKeys: item.notEligibleReasons.map(ineligibilityKey),
      })),
      hasMore,
    };
  }
  switch (result.kind) {
    case "signed-out":
    case "unavailable":
      return { kind: "hidden" };
    case "network":
      return { kind: "error" };
    case "http":
      return result.status === 403 ? { kind: "forbidden" } : { kind: "error" };
  }
}
