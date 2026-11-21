import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingReviewQueue, ListingReviewQueueItem } from "../types";

import { reviewPath, reviewQueueModel } from "./review-queue-model";
import { phraseText } from "./revision-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });

const ITEM: ListingReviewQueueItem = {
  listingId: "01JG000000000000000000000L",
  code: "TD-7K3M-Q9TX",
  revisionNo: 2,
  submittedAt: "2026-11-21T03:00:00Z",
  title: "Phòng trọ gần trường đại học",
  unit: {
    assetType: "HOUSE",
    provinceCode: "79",
    provinceName: "Thành phố Hồ Chí Minh",
    wardCode: "26734",
    wardName: "Phường Bến Thành",
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 25.5,
  },
  viewerMayReview: true,
  notEligibleReasons: [],
};

const answered = (data: ListingReviewQueue): ApiResult<ListingReviewQueue> => ({ ok: true, status: 200, replayed: false, data });
const refused = (status: number, code: string): ApiResult<ListingReviewQueue> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

describe("review queue model (listing-publish E06-S4, spec section 6, E06S4-D10)", () => {
  it("reviewQueueModel_answers_statesAndRows: rows in the answer's order with a review link only where the viewer may review; the session hides, 403 forbids, anything else is an error", () => {
    const other: ListingReviewQueueItem = {
      ...ITEM,
      listingId: "01JG000000000000000000000M",
      code: "TD-8A2B-C3DE",
      revisionNo: 1,
      unit: { ...ITEM.unit, assetType: null, provinceName: null, wardName: null },
      viewerMayReview: false,
      notEligibleReasons: ["AUTHOR"],
    };
    const model = reviewQueueModel(answered({ items: [ITEM, other], hasMore: true }));
    if (model.kind !== "ready") throw new Error(`expected ready, got ${model.kind}`);
    expect(model.hasMore).toBe(true);
    expect(model.rows.map(({ unitLine, ...row }) => ({ ...row, unit: unitLine.map((phrase) => phraseText(t, phrase)) }))).toEqual([
      {
        listingId: "01JG000000000000000000000L",
        code: "TD-7K3M-Q9TX",
        revisionNo: 2,
        submittedAt: "2026-11-21T03:00:00Z",
        title: "Phòng trọ gần trường đại học",
        unit: ["House", "Phường Bến Thành, Thành phố Hồ Chí Minh", "2 bedrooms, 1 bathroom", "25.5 m²"],
        reviewHref: "/workspace/listings/01JG000000000000000000000L/revisions/2/review",
        reasonKeys: [],
      },
      {
        listingId: "01JG000000000000000000000M",
        code: "TD-8A2B-C3DE",
        revisionNo: 1,
        submittedAt: "2026-11-21T03:00:00Z",
        title: "Phòng trọ gần trường đại học",
        unit: ["2 bedrooms, 1 bathroom", "25.5 m²"],
        reviewHref: null,
        reasonKeys: ["review.ineligible.AUTHOR"],
      },
    ]);

    expect(reviewQueueModel(answered({ items: [], hasMore: false }))).toEqual({ kind: "empty" });
    // Every candidate left out (ended agreements) with more waiting: no row, the "more" sentence only.
    expect(reviewQueueModel(answered({ items: [], hasMore: true }))).toEqual({ kind: "ready", rows: [], hasMore: true });
    expect(reviewQueueModel(refused(403, "FORBIDDEN"))).toEqual({ kind: "forbidden" });
    for (const result of [{ ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as ApiResult<ListingReviewQueue>[]) {
      expect(reviewQueueModel(result)).toEqual({ kind: "hidden" });
    }
    for (const result of [refused(500, "INTERNAL_ERROR"), refused(404, "NOT_FOUND"), { ok: false, kind: "network" } as ApiResult<ListingReviewQueue>]) {
      expect(reviewQueueModel(result)).toEqual({ kind: "error" });
    }
    expect(reviewPath("01JG 0/x", 3)).toBe("/workspace/listings/01JG%200%2Fx/revisions/3/review");
  });

  it("reviewQueueModel_reasons_keysInOrder: the reasons a viewer may not review read one sentence each, in the server's order; an unknown reason reads its fallback", () => {
    const model = reviewQueueModel(
      answered({
        items: [{ ...ITEM, viewerMayReview: false, notEligibleReasons: ["NOT_A_REVIEWER", "AUTHOR", "ASSIGNED_SALE", "SOMETHING_NEW" as never] }],
        hasMore: false,
      }),
    );
    if (model.kind !== "ready") throw new Error(`expected ready, got ${model.kind}`);
    expect(model.rows[0]?.reviewHref).toBeNull();
    expect(model.rows[0]?.reasonKeys.map((key) => t(key))).toEqual([
      "You do not hold a listing reviewer role.",
      "You created or edited this revision.",
      "You are the listing's assigned Sale.",
      "Another reason stops it.",
    ]);
  });
});
