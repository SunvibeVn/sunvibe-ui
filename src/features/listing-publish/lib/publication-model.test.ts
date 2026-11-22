import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingPublication } from "../types";

import { publicationModel } from "./publication-model";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });

const LISTING_ID = "01JG000000000000000000000L";

/** A Published listing with revision 2 live and revision 3 approved and waiting, stopped by E05 and the freshness. */
const PUBLICATION: ListingPublication = {
  listingId: LISTING_ID,
  state: "PUBLISHED",
  dataVersion: 9,
  live: { revisionNo: 2, wentLiveAt: "2026-11-22T03:00:00Z", display: { holds: true, reasons: [], reasonGroups: [] } },
  approved: {
    revisionNo: 3,
    termsSource: "IN_EFFECT",
    display: { holds: false, reasons: ["ADVERTISING_RIGHT", "FRESHNESS"], reasonGroups: ["SUSPENDED", "UNIT"] },
  },
  viewerMayPutLive: true,
  viewerMayCopy: true,
};

const ok = (data: ListingPublication): ApiResult<ListingPublication> => ({ ok: true, status: 200, replayed: false, data });
const http = (status: number, code: string): ApiResult<ListingPublication> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });

describe("publication model (listing-publish E06-S6, spec section 6, E06S6-D11, E06S6-P5)", () => {
  it("publicationModel_liveAndWaiting_linesAndPermissions: loading before the answer; the live and the waiting revision with their display answers as keys, the permissions and the data version", () => {
    expect(publicationModel(null)).toEqual({ kind: "loading" });

    const model = publicationModel(ok(PUBLICATION));
    expect(model).toEqual({
      kind: "ready",
      live: { revisionNo: 2, wentLiveAt: "2026-11-22T03:00:00Z", holds: true, reasonKeys: [], groupKeys: [] },
      approved: {
        revisionNo: 3,
        holds: false,
        reasonKeys: ["publication.reasons.ADVERTISING_RIGHT", "publication.reasons.FRESHNESS"],
        groupKeys: ["reasons.SUSPENDED", "reasons.UNIT"],
      },
      mayPutLive: true,
      mayCopy: true,
      dataVersion: 9,
    });
    if (model.kind !== "ready" || model.approved === null) throw new Error(`expected ready with a waiting revision, got ${model.kind}`);
    expect(model.approved.reasonKeys.map((key) => t(key))).toEqual([
      "The agreement does not allow advertising now:",
      "No valid freshness confirmation is in date.",
    ]);
    expect(model.approved.groupKeys.map((key) => t(key))).toEqual(["The agreement is suspended.", "Something about this unit stops it."]);

    // Nothing live and nothing waiting; the hints come as the server sends them.
    expect(publicationModel(ok({ ...PUBLICATION, state: "UNPUBLISHED", live: null, approved: null, viewerMayPutLive: false, viewerMayCopy: false }))).toEqual({
      kind: "ready",
      live: null,
      approved: null,
      mayPutLive: false,
      mayCopy: false,
      dataVersion: 9,
    });
  });

  it("publicationModel_archived_archivedOnly: a read that answers ARCHIVED is the archived sentence only, whatever else it holds", () => {
    expect(publicationModel(ok({ ...PUBLICATION, state: "ARCHIVED", live: null, approved: null, viewerMayPutLive: false, viewerMayCopy: false }))).toEqual({
      kind: "archived",
    });
    expect(publicationModel(ok({ ...PUBLICATION, state: "ARCHIVED" }))).toEqual({ kind: "archived" });
  });

  it("publicationModel_unknownReason_otherKey: a reason or a group this UI does not know reads its fallback, never dropped; the five reasons keep the answer's order", () => {
    const model = publicationModel(
      ok({
        ...PUBLICATION,
        live: null,
        approved: {
          revisionNo: 3,
          termsSource: "PENDING_START",
          display: {
            holds: false,
            reasons: ["LISTING_STATE", "ADVERTISING_RIGHT", "TERMS_NOT_IN_EFFECT", "UNIT_NOT_AVAILABLE", "FRESHNESS", "SOMETHING_NEW" as never],
            reasonGroups: ["ENDED", "NEW_GROUP" as never],
          },
        },
      }),
    );
    if (model.kind !== "ready" || model.approved === null) throw new Error(`expected ready with a waiting revision, got ${model.kind}`);
    expect(model.approved.reasonKeys).toEqual([
      "publication.reasons.LISTING_STATE",
      "publication.reasons.ADVERTISING_RIGHT",
      "publication.reasons.TERMS_NOT_IN_EFFECT",
      "publication.reasons.UNIT_NOT_AVAILABLE",
      "publication.reasons.FRESHNESS",
      "publication.reasons.OTHER",
    ]);
    expect(model.approved.groupKeys).toEqual(["reasons.ENDED", "reasons.OTHER"]);
    expect(t("publication.reasons.OTHER")).toBe("Another condition does not hold.");
  });

  it("publicationModel_notFoundOrSession_none: the one 404 and the session answers show nothing", () => {
    for (const result of [http(404, "NOT_FOUND"), { ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable", retryAfterSeconds: 30 }] as ApiResult<ListingPublication>[]) {
      expect(publicationModel(result)).toEqual({ kind: "none" });
    }
  });

  it("publicationModel_serverErrorOrNetwork_error: a 500, a 403 and no answer are the error with its retry", () => {
    for (const result of [http(500, "INTERNAL_ERROR"), http(403, "FORBIDDEN"), { ok: false, kind: "network" }] as ApiResult<ListingPublication>[]) {
      expect(publicationModel(result)).toEqual({ kind: "error" });
    }
  });
});
