import type { ApiResult } from "@/features/auth/client";

import type { ListingReconfirmations } from "../types";

import { formatCalendarDate } from "./freshness-model";
import { listingPath } from "./listing-model";
import { listingStateKey, type ListingStateKey } from "./listing-text";

/** One listing to reconfirm: a link to its page, its state, the three dates and the two flags. */
export type ReconfirmationRow = {
  listingId: string;
  href: string;
  code: string;
  stateKey: ListingStateKey;
  confirmedOn: string;
  reconfirmFrom: string;
  validThrough: string;
  deadlinePassed: boolean;
  latestRecordValid: boolean;
};

/**
 * "Listings to reconfirm" (spec section 6, E06S3-D7, D13). `forbidden`: the 403 of a role the list does not admit;
 * `hidden`: a session answer; `empty`: nothing to reconfirm and nothing more; `ready`: the rows, oldest confirmation
 * first, and whether more may need it (a list may be short, even empty, with more).
 */
export type ReconfirmationListModel =
  | { kind: "error" }
  | { kind: "forbidden" }
  | { kind: "hidden" }
  | { kind: "empty" }
  | { kind: "ready"; rows: ReconfirmationRow[]; hasMore: boolean };

export function reconfirmationListModel(result: ApiResult<ListingReconfirmations>): ReconfirmationListModel {
  if (result.ok) {
    const { items, hasMore } = result.data;
    if (items.length === 0 && !hasMore) return { kind: "empty" };
    return {
      kind: "ready",
      rows: items.map((item) => ({
        listingId: item.listingId,
        href: listingPath(item.listingId),
        code: item.code,
        stateKey: listingStateKey(item.state),
        confirmedOn: formatCalendarDate(item.confirmedOn),
        reconfirmFrom: formatCalendarDate(item.reconfirmFrom),
        validThrough: formatCalendarDate(item.validThrough),
        deadlinePassed: item.deadlinePassed,
        latestRecordValid: item.latestRecordValid,
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
