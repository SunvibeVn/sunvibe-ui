import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingDetail, ListingRevisionDecision, ListingRevisionItem } from "../types";

import { type RevisionDecisionInput, revisionDecisionInput, revisionDecisionModel } from "./revision-decision-model";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });

const LISTING_ID = "01JG000000000000000000000L";

const item = (revisionNo: number, status: ListingRevisionItem["status"]): ListingRevisionItem => ({
  revisionNo,
  status,
  createdAt: "2026-11-20T03:15:00Z",
});

const DETAIL: ListingDetail = {
  listingId: LISTING_ID,
  code: "TD-7K3M-Q9TX",
  state: "UNPUBLISHED",
  transactionType: "LONG_TERM_RENT",
  unitId: "01JE000000000000000000000U",
  agreementId: "01JF000000000000000000000A",
  createdAt: "2026-11-20T03:15:00Z",
  dataVersion: 7,
  viewerIsAssignedSale: true,
  openRevisionNo: null,
  revisions: [],
  hasOlderRevisions: false,
};

const RETURNED: ListingRevisionDecision = {
  outcome: "NEEDS_CHANGES",
  decidedAt: "2026-11-22T03:00:00Z",
  checklistVersion: null,
  changeReasons: ["MISSING_INFORMATION", "OTHER"],
  rejectionGroup: null,
  note: "Thiếu diện tích.",
};

const ok = (data: ListingRevisionDecision): ApiResult<ListingRevisionDecision> => ({ ok: true, status: 200, replayed: false, data });
const INPUT: RevisionDecisionInput = { revisionNo: 2, status: "NEEDS_CHANGES", dataVersion: 7, openRevisionNo: null, viewerIsAssignedSale: true };

describe("revision decision model (listing-publish E06-S4, spec section 6, E06S4-D15, D17, P12)", () => {
  it("revisionDecisionInput_newestDecidedOfThreeStatuses: the newest listed revision that is Needs changes, Rejected or Approved, with the listing's data version, open revision and assignee; none listed is null", () => {
    expect(revisionDecisionInput({ ...DETAIL, revisions: [item(3, "DRAFT"), item(2, "NEEDS_CHANGES"), item(1, "CANCELLED")], openRevisionNo: 3 })).toEqual({
      revisionNo: 2,
      status: "NEEDS_CHANGES",
      dataVersion: 7,
      openRevisionNo: 3,
      viewerIsAssignedSale: true,
    });
    for (const status of ["NEEDS_CHANGES", "REJECTED", "APPROVED"] as const) {
      expect(revisionDecisionInput({ ...DETAIL, revisions: [item(4, "PENDING_REVIEW"), item(3, status), item(2, "NEEDS_CHANGES")] })?.revisionNo).toBe(3);
      expect(revisionDecisionInput({ ...DETAIL, revisions: [item(4, "PENDING_REVIEW"), item(3, status)] })?.status).toBe(status);
    }
    // The newest by number, whatever the order of the list.
    expect(revisionDecisionInput({ ...DETAIL, revisions: [item(1, "REJECTED"), item(5, "APPROVED"), item(3, "NEEDS_CHANGES")] })?.revisionNo).toBe(5);
    expect(revisionDecisionInput({ ...DETAIL, viewerIsAssignedSale: false, revisions: [item(1, "REJECTED")] })?.viewerIsAssignedSale).toBe(false);
    for (const status of ["DRAFT", "PENDING_REVIEW", "CANCELLED", "LIVE", "REPLACED"] as const) {
      expect(revisionDecisionInput({ ...DETAIL, revisions: [item(1, status)] })).toBeNull();
    }
    expect(revisionDecisionInput(DETAIL)).toBeNull();
  });

  it("revisionDecisionModel_mayCopy_onlyNeedsChangesAssigneeNoOpen: the decision as shown; the copy only for a return, for the assigned Sale, while no revision is open; a rejection says why it cannot be copied", () => {
    expect(revisionDecisionModel(null, INPUT)).toEqual({ kind: "loading" });
    const ready = revisionDecisionModel(ok(RETURNED), INPUT);
    if (ready.kind !== "ready") throw new Error(`expected ready, got ${ready.kind}`);
    expect(ready).toMatchObject({ revisionNo: 2, outcomeKey: "revisionStatuses.NEEDS_CHANGES", decidedAt: "2026-11-22T03:00:00Z", groupKey: null, note: "Thiếu diện tích.", mayCopy: true, rejected: false });
    expect(ready.reasonKeys.map((key) => t(key))).toEqual(["Information is missing.", "Other (say what in the note)."]);

    expect(revisionDecisionModel(ok(RETURNED), { ...INPUT, openRevisionNo: 3 })).toMatchObject({ kind: "ready", mayCopy: false });
    expect(revisionDecisionModel(ok(RETURNED), { ...INPUT, viewerIsAssignedSale: false })).toMatchObject({ kind: "ready", mayCopy: false });

    const rejected = revisionDecisionModel(ok({ ...RETURNED, outcome: "REJECTED", changeReasons: [], rejectionGroup: "WRONG_UNIT", note: "Sai căn." }), { ...INPUT, status: "REJECTED" });
    if (rejected.kind !== "ready") throw new Error(`expected ready, got ${rejected.kind}`);
    expect(rejected).toMatchObject({ outcomeKey: "revisionStatuses.REJECTED", mayCopy: false, rejected: true, reasonKeys: [] });
    expect(t(rejected.groupKey ?? "page.title")).toBe("Wrong unit.");

    const approved = revisionDecisionModel(ok({ ...RETURNED, outcome: "APPROVED", checklistVersion: 1, changeReasons: [], note: null }), { ...INPUT, status: "APPROVED" });
    expect(approved).toMatchObject({ kind: "ready", outcomeKey: "revisionStatuses.APPROVED", mayCopy: false, rejected: false, note: null, groupKey: null });

    expect(revisionDecisionModel({ ok: false, kind: "http", status: 404, code: "NOT_FOUND", fieldErrors: [] }, INPUT)).toEqual({ kind: "none" });
    for (const result of [{ ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as ApiResult<ListingRevisionDecision>[]) {
      expect(revisionDecisionModel(result, INPUT)).toEqual({ kind: "none" });
    }
    for (const result of [
      { ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [] },
      { ok: false, kind: "http", status: 403, code: "FORBIDDEN", fieldErrors: [] },
      { ok: false, kind: "network" },
    ] as ApiResult<ListingRevisionDecision>[]) {
      expect(revisionDecisionModel(result, INPUT)).toEqual({ kind: "error" });
    }
  });
});
