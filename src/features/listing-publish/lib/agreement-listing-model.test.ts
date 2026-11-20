import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { AgreementListings, ListingItem } from "../types";

import { agreementListingModel } from "./agreement-listing-model";

const AGREEMENT_ID = "01JF000000000000000000000A";

const item = (listingId: string, code: string, state: ListingItem["state"]): ListingItem => ({
  listingId,
  code,
  state,
  createdAt: "2026-11-20T03:15:00Z",
});

const OPEN = item("01JG00000000000000000000L3", "TD-7K3M-Q9TX", "UNPUBLISHED");
const ARCHIVED_2 = item("01JG00000000000000000000L2", "TD-2345-6789", "ARCHIVED");
const ARCHIVED_1 = item("01JG00000000000000000000L1", "TD-ABCD-EFGH", "ARCHIVED");

function answered(
  listings: ListingItem[],
  creation: Partial<AgreementListings["creation"]> = {},
  hasOlder = false,
): ApiResult<AgreementListings> {
  return {
    ok: true,
    status: 200,
    replayed: false,
    data: {
      agreementId: AGREEMENT_ID,
      listings,
      hasOlder,
      creation: { viewerMayCreate: false, advertisingNotStarted: false, reasonGroups: [], ...creation },
    },
  };
}

const failed = (status: number, code: string): ApiResult<AgreementListings> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: [],
});

const line = (listing: ListingItem, stateKey: string) => ({ listingId: listing.listingId, code: listing.code, stateKey });

describe("agreementListingModel (listing-publish E06-S1, spec section 6, UL-1)", () => {
  it("agreementListingModel_openListing_noOffer: an open listing is its line, with no empty line, offer, refusal or assigned-Sale line", () => {
    const model = agreementListingModel(
      answered([OPEN, ARCHIVED_2], { viewerMayCreate: true, advertisingNotStarted: true, reasonGroups: ["SUSPENDED"] }),
    );

    expect(model).toEqual({
      kind: "ready",
      open: line(OPEN, "states.UNPUBLISHED"),
      archived: [line(ARCHIVED_2, "states.ARCHIVED")],
      emptyLine: null,
      offer: null,
      refusals: [],
      assignedSaleOnly: false,
      older: false,
    });
  });

  it("agreementListingModel_noListing_offerWithNotStarted: no listing and the caller may create: the empty line and the offer, with or without the not-started line", () => {
    for (const advertisingNotStarted of [false, true]) {
      expect(agreementListingModel(answered([], { viewerMayCreate: true, advertisingNotStarted }))).toEqual({
        kind: "ready",
        open: null,
        archived: [],
        emptyLine: "section.noListing",
        offer: { notStarted: advertisingNotStarted },
        refusals: [],
        assignedSaleOnly: false,
        older: false,
      });
    }
  });

  it("agreementListingModel_archivedOnly_noOpenLineAndArchivedList: archived listings only: the no-open line and each archived listing in the answer's order", () => {
    const model = agreementListingModel(answered([ARCHIVED_2, ARCHIVED_1], { viewerMayCreate: true }));

    expect(model).toMatchObject({
      kind: "ready",
      open: null,
      archived: [line(ARCHIVED_2, "states.ARCHIVED"), line(ARCHIVED_1, "states.ARCHIVED")],
      emptyLine: "section.noOpenListing",
      offer: { notStarted: false },
    });
  });

  it("agreementListingModel_refused_groupLines: a refusal lists one line per group in E05's order; an unknown group reads the fallback", () => {
    const groups = ["NOT_STARTED", "SUSPENDED", "NEW_GROUP", "OWNER"] as AgreementListings["creation"]["reasonGroups"];
    const model = agreementListingModel(answered([ARCHIVED_1], { viewerMayCreate: false, reasonGroups: groups }));

    expect(model).toEqual({
      kind: "ready",
      open: null,
      archived: [line(ARCHIVED_1, "states.ARCHIVED")],
      emptyLine: "section.noOpenListing",
      offer: null,
      refusals: ["reasons.NOT_STARTED", "reasons.SUSPENDED", "reasons.OTHER", "reasons.OWNER"],
      assignedSaleOnly: false,
      older: false,
    });
  });

  it("agreementListingModel_notAssignee_assignedSaleLine: no offer and no group: only the lead's assigned Sale creates a listing", () => {
    expect(agreementListingModel(answered([], { viewerMayCreate: false, reasonGroups: [] }))).toEqual({
      kind: "ready",
      open: null,
      archived: [],
      emptyLine: "section.noListing",
      offer: null,
      refusals: [],
      assignedSaleOnly: true,
      older: false,
    });
  });

  it("agreementListingModel_hasOlder_olderLine: hasOlder gives the older line, with or without an open listing", () => {
    expect(agreementListingModel(answered([OPEN], {}, true))).toMatchObject({ kind: "ready", older: true });
    expect(agreementListingModel(answered([ARCHIVED_1], {}, true))).toMatchObject({ kind: "ready", older: true });
    expect(agreementListingModel(answered([ARCHIVED_1], {}, false))).toMatchObject({ kind: "ready", older: false });
  });

  it("agreementListingModel_failures_hiddenOrError: a 404 and the session answers hide the section; a 403, a 500 and no answer are errors", () => {
    const hidden: ApiResult<AgreementListings>[] = [
      failed(404, "NOT_FOUND"),
      { ok: false, kind: "signed-out" },
      { ok: false, kind: "unavailable", retryAfterSeconds: 30 },
    ];
    for (const result of hidden) expect(agreementListingModel(result)).toEqual({ kind: "hidden" });

    const errors: ApiResult<AgreementListings>[] = [
      failed(403, "FORBIDDEN"),
      failed(500, "INTERNAL_ERROR"),
      { ok: false, kind: "network" },
    ];
    for (const result of errors) expect(agreementListingModel(result)).toEqual({ kind: "error" });
  });
});
