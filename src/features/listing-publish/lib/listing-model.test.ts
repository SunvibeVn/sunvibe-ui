import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingDetail } from "../types";

import { listingModel, listingPath } from "./listing-model";

const LISTING_ID = "01JG000000000000000000000L";
const AGREEMENT_ID = "01JF000000000000000000000A";

/** The answer of spec section 4's example, with a second revision. */
const DETAIL: ListingDetail = {
  listingId: LISTING_ID,
  code: "TD-7K3M-Q9TX",
  state: "UNPUBLISHED",
  transactionType: "LONG_TERM_RENT",
  unitId: "01JE000000000000000000000U",
  agreementId: AGREEMENT_ID,
  createdAt: "2026-11-20T03:15:00Z",
  dataVersion: 0,
  viewerIsAssignedSale: true,
  openRevisionNo: 2,
  revisions: [
    { revisionNo: 2, status: "PENDING_REVIEW", createdAt: "2026-11-21T03:15:00Z" },
    { revisionNo: 1, status: "DRAFT", createdAt: "2026-11-20T03:15:00Z" },
  ],
  hasOlderRevisions: false,
};

const answered = (data: ListingDetail): ApiResult<ListingDetail> => ({ ok: true, status: 200, replayed: false, data });
const failed = (status: number, code: string): ApiResult<ListingDetail> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: [],
});

describe("listingModel (listing-publish E06-S1, spec section 6, UL-3)", () => {
  it("listingModel_ready_fields: the code, state, transaction, created time, agreement link and revisions in the answer's order (newest first); an unknown code reads its fallback", () => {
    expect(listingModel(answered(DETAIL))).toEqual({
      kind: "ready",
      code: "TD-7K3M-Q9TX",
      stateKey: "states.UNPUBLISHED",
      transactionKey: "transactionTypes.LONG_TERM_RENT",
      createdAt: "2026-11-20T03:15:00Z",
      agreementHref: `/workspace/brokerage-agreements/${AGREEMENT_ID}`,
      revisions: [
        { revisionNo: 2, statusKey: "revisionStatuses.PENDING_REVIEW", createdAt: "2026-11-21T03:15:00Z" },
        { revisionNo: 1, statusKey: "revisionStatuses.DRAFT", createdAt: "2026-11-20T03:15:00Z" },
      ],
      olderRevisions: false,
    });
    expect(listingPath(LISTING_ID)).toBe(`/workspace/listings/${LISTING_ID}`);

    const unknown = listingModel(
      answered({
        ...DETAIL,
        state: "WITHDRAWN" as ListingDetail["state"],
        transactionType: "SALE" as ListingDetail["transactionType"],
        revisions: [{ revisionNo: 1, status: "SHELVED" as never, createdAt: "2026-11-20T03:15:00Z" }],
      }),
    );
    expect(unknown).toMatchObject({
      stateKey: "states.OTHER",
      transactionKey: "transactionTypes.OTHER",
      revisions: [{ revisionNo: 1, statusKey: "revisionStatuses.OTHER" }],
    });
  });

  it("listingModel_hasOlderRevisions_olderLine: hasOlderRevisions gives the older line", () => {
    expect(listingModel(answered({ ...DETAIL, hasOlderRevisions: true }))).toMatchObject({ kind: "ready", olderRevisions: true });
  });

  it("listingModel_failures_notFoundErrorOrHidden: a 404 is not found; the session answers hide the page; a 403, a 500 and no answer are errors", () => {
    expect(listingModel(failed(404, "NOT_FOUND"))).toEqual({ kind: "not-found" });
    for (const result of [{ ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as ApiResult<ListingDetail>[]) {
      expect(listingModel(result)).toEqual({ kind: "hidden" });
    }
    for (const result of [failed(403, "FORBIDDEN"), failed(500, "INTERNAL_ERROR"), { ok: false, kind: "network" }] as ApiResult<ListingDetail>[]) {
      expect(listingModel(result)).toEqual({ kind: "error" });
    }
  });
});
