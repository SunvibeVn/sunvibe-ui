import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingReconfirmationItem, ListingReconfirmations } from "../types";

import { reconfirmationListModel } from "./reconfirmation-model";

const PAUSED_ROW: ListingReconfirmationItem = {
  listingId: "01JG000000000000000000000A",
  code: "TD-7K3M-Q9TX",
  state: "PAUSED",
  confirmedOn: "2027-03-01",
  reconfirmFrom: "2027-03-11",
  validThrough: "2027-03-15",
  deadlinePassed: true,
  latestRecordValid: false,
};
const UNPUBLISHED_ROW: ListingReconfirmationItem = {
  listingId: "01JG000000000000000000000B",
  code: "TD-8P2Q-R4ST",
  state: "UNPUBLISHED",
  confirmedOn: "2027-03-04",
  reconfirmFrom: "2027-03-14",
  validThrough: "2027-03-18",
  deadlinePassed: false,
  latestRecordValid: true,
};

const answered = (data: ListingReconfirmations): ApiResult<ListingReconfirmations> => ({ ok: true, status: 200, replayed: false, data });

describe("reconfirmation list model (listing-publish E06-S3, spec section 6, E06S3-D7, D13)", () => {
  it("reconfirmationModel_rows_hrefStateDatesAndBadges: each row links to its listing page, with its state's text, its three dates formatted and its two flags", () => {
    expect(reconfirmationListModel(answered({ items: [PAUSED_ROW, UNPUBLISHED_ROW], hasMore: false }))).toEqual({
      kind: "ready",
      rows: [
        {
          listingId: PAUSED_ROW.listingId,
          href: `/workspace/listings/${PAUSED_ROW.listingId}`,
          code: "TD-7K3M-Q9TX",
          stateKey: "states.PAUSED",
          confirmedOn: "Mar 1, 2027",
          reconfirmFrom: "Mar 11, 2027",
          validThrough: "Mar 15, 2027",
          deadlinePassed: true,
          latestRecordValid: false,
        },
        {
          listingId: UNPUBLISHED_ROW.listingId,
          href: `/workspace/listings/${UNPUBLISHED_ROW.listingId}`,
          code: "TD-8P2Q-R4ST",
          stateKey: "states.UNPUBLISHED",
          confirmedOn: "Mar 4, 2027",
          reconfirmFrom: "Mar 14, 2027",
          validThrough: "Mar 18, 2027",
          deadlinePassed: false,
          latestRecordValid: true,
        },
      ],
      hasMore: false,
    });
  });

  it("reconfirmationModel_forbiddenEmptyHasMore_states: a 403 is forbidden, an empty list empty, a list with more a ready model saying so", () => {
    const results: ApiResult<ListingReconfirmations>[] = [
      { ok: false, kind: "http", status: 403, code: "FORBIDDEN", fieldErrors: [] },
      answered({ items: [], hasMore: false }),
      answered({ items: [UNPUBLISHED_ROW], hasMore: true }),
      answered({ items: [], hasMore: true }),
      { ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [] },
      { ok: false, kind: "unavailable" },
    ];
    expect(
      results.map((result) => {
        const model = reconfirmationListModel(result);
        return model.kind === "ready" ? { kind: model.kind, rows: model.rows.length, hasMore: model.hasMore } : model;
      }),
    ).toEqual([
      { kind: "forbidden" },
      { kind: "empty" },
      { kind: "ready", rows: 1, hasMore: true },
      { kind: "ready", rows: 0, hasMore: true },
      { kind: "error" },
      { kind: "hidden" },
    ]);
  });
});
