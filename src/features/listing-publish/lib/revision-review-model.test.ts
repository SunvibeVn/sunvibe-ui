import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingRevisionDetail, ListingRevisionReview, ListingTerms } from "../types";

import { type ReviewPageModel, reviewPageModel, rereadOutcome, revisionNoOf } from "./revision-review-model";
import { phraseText } from "./revision-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });

const LISTING_ID = "01JG000000000000000000000L";

const TERMS: ListingTerms = {
  monthlyRent: { amount: 4500000, currency: "VND", unit: "MONTH" },
  deposit: { basis: "MONTHS", months: 2, amount: null, currency: null },
  minimumTermMonths: 6,
  paymentPeriodMonths: 1,
  mandatoryFees: [],
};

const REVIEW: ListingRevisionReview = {
  listingId: LISTING_ID,
  code: "TD-7K3M-Q9TX",
  revisionNo: 2,
  status: "PENDING_REVIEW",
  dataVersion: 9,
  viewerMayReview: true,
  notEligibleReasons: [],
  advertising: {
    allowed: true,
    ended: false,
    reasonGroups: [],
    endDate: "2027-05-31",
    interiorPhotos: true,
    exteriorPhotos: false,
    termsInEffect: TERMS,
    pending: { startDate: "2027-01-01", terms: { ...TERMS, minimumTermMonths: 12 } },
  },
  termsMatch: "IN_EFFECT",
  unit: { unitCode: "A-101", availability: "AVAILABLE", availabilityDiffers: true },
  freshness: { confirmedOn: "2026-11-20", validThrough: "2026-12-04", deadlinePassed: false, latestValid: true },
  checklist: ["CONTENT_MATCHES_UNIT", "TEXT_FOLLOWS_RULES", "TERMS_MATCH_AGREEMENT", "NO_FRAUD_SIGNS", "AGREEMENT_END_AND_RIGHT"],
};

const REVISION: ListingRevisionDetail = {
  listingId: LISTING_ID,
  revisionNo: 2,
  status: "PENDING_REVIEW",
  createdAt: "2026-11-20T03:15:00Z",
  updatedAt: "2026-11-21T03:15:00Z",
  title: "Phòng trọ gần trường đại học",
  description: "Phòng rộng.\nGần chợ.",
  features: {
    furnishing: null,
    airConditioner: true,
    waterHeater: false,
    fridge: false,
    washingMachine: null,
    kitchen: null,
    balcony: false,
    elevator: false,
    motorbikeParking: false,
    carParking: false,
    internet: false,
    pets: null,
    noSharedLandlord: false,
  },
  termsSnapshot: { source: "IN_EFFECT", pendingStartDate: null, capturedAt: "2026-11-21T02:00:00Z", terms: TERMS },
  unitSnapshot: {
    assetType: "HOUSE",
    provinceCode: "79",
    provinceName: "Thành phố Hồ Chí Minh",
    wardCode: "26734",
    wardName: "Phường Bến Thành",
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 25.5,
  },
  submittedAt: "2026-11-21T03:00:00Z",
  dataVersion: 9,
  problems: [],
};

const ok = <T>(data: T): ApiResult<T> => ({ ok: true, status: 200, replayed: false, data });
const http = (status: number, code: string): ApiResult<never> => ({ ok: false, kind: "http", status, code, fieldErrors: [] });
const SIGNED_OUT: ApiResult<never> = { ok: false, kind: "signed-out" };
const NETWORK: ApiResult<never> = { ok: false, kind: "network" };

function ready(model: ReviewPageModel) {
  if (model.kind !== "ready") throw new Error(`expected a ready model, got ${model.kind}`);
  return model;
}

describe("review page model (listing-publish E06-S4, spec section 6, E06S4-D11, D17, P11)", () => {
  it("revisionReviewModel_revisionNoOf_canonicalOnly: only a canonical decimal number of 1 or more is a revision number", () => {
    expect(revisionNoOf("1")).toBe(1);
    expect(revisionNoOf("12")).toBe(12);
    for (const text of ["01", "0", "1.0", "x", "", " 1", "1e1", "-1", "+1"]) expect(revisionNoOf(text)).toBeNull();
  });

  it("revisionReviewModel_bothReads_readyOnlyWhenBothAnswered: loading until both reads answer; then the header, the eligibility, the content and the context", () => {
    expect(reviewPageModel(null, null)).toEqual({ kind: "loading" });
    expect(reviewPageModel(ok(REVIEW), null)).toEqual({ kind: "loading" });
    expect(reviewPageModel(null, ok(REVISION))).toEqual({ kind: "loading" });

    const model = ready(reviewPageModel(ok(REVIEW), ok(REVISION)));
    expect(model).toMatchObject({
      code: "TD-7K3M-Q9TX",
      revisionNo: 2,
      statusKey: "revisionStatuses.PENDING_REVIEW",
      mayDecide: true,
      reasonKeys: [],
      termsMatch: "IN_EFFECT",
      termsMatchKey: "review.termsMatch.IN_EFFECT",
      dataVersion: 9,
      unit: { code: "A-101", ward: "Phường Bến Thành", availabilityKey: "review.availabilities.AVAILABLE", availabilityDiffers: true },
      freshness: { confirmedOn: "Nov 20, 2026", validThrough: "Dec 4, 2026", deadlinePassed: false, latestValid: true },
    });
    expect(model.checklist.map((item) => t(item.key))[0]).toBe("Text, features and terms match the unit (type, rooms, area, features).");
    expect(model.checklist.map((item) => item.code)).toEqual(REVIEW.checklist);
    expect(model.screen.title).toBe("Phòng trọ gần trường đại học");
    expect(model.screen.description).toBe("Phòng rộng.\nGần chợ.");
    expect(model.screen.problems).toEqual([]);
    expect(model.agreement).toMatchObject({
      allowed: true,
      reasonKeys: [],
      endDate: "May 31, 2027",
      interiorPhotos: true,
      exteriorPhotos: false,
    });
    expect(model.agreement?.termsInEffect?.map((line) => phraseText(t, line))[0]).toBe("Rent: 4,500,000 VND / month");
    expect(model.agreement?.pending?.startDate).toBe("Jan 1, 2027");
    expect(model.agreement?.pending?.lines.map((line) => phraseText(t, line))[2]).toBe("Minimum term: 12 months");

    // Not allowed, E05's groups as sentences; no answer from E05 at all; no unit from property; a reader who may not decide.
    const other = ready(
      reviewPageModel(
        ok({
          ...REVIEW,
          viewerMayReview: false,
          notEligibleReasons: ["NOT_A_REVIEWER", "NOT_PENDING"],
          advertising: { ...(REVIEW.advertising as NonNullable<ListingRevisionReview["advertising"]>), allowed: false, reasonGroups: ["SUSPENDED", "UNIT"], endDate: null, termsInEffect: null, pending: null },
          unit: { unitCode: null, availability: null, availabilityDiffers: false },
          freshness: { confirmedOn: null, validThrough: null, deadlinePassed: false, latestValid: null },
        }),
        ok({ ...REVISION, unitSnapshot: null }),
      ),
    );
    expect(other.mayDecide).toBe(false);
    expect(other.reasonKeys.map((key) => t(key))).toEqual(["You do not hold a listing reviewer role.", "This revision is no longer waiting for review."]);
    expect(other.agreement).toMatchObject({ allowed: false, endDate: null, termsInEffect: null, pending: null });
    expect(other.agreement?.reasonKeys.map((key) => t(key))).toEqual(["The agreement is suspended.", "Something about this unit stops it."]);
    expect(other.unit).toEqual({ code: null, ward: null, availabilityKey: null, availabilityDiffers: false });
    expect(other.freshness).toEqual({ confirmedOn: null, validThrough: null, deadlinePassed: false, latestValid: null });
    expect(ready(reviewPageModel(ok({ ...REVIEW, advertising: null }), ok(REVISION))).agreement).toBeNull();
  });

  it("revisionReviewModel_failures_stateByRule: a session answer hides; the review read's 403 forbids before any 404; a 404 of either is not found; any other failure, with the other read answered or not, is an error", () => {
    expect(reviewPageModel(SIGNED_OUT, ok(REVISION))).toEqual({ kind: "hidden" });
    expect(reviewPageModel(ok(REVIEW), { ok: false, kind: "unavailable" })).toEqual({ kind: "hidden" });
    expect(reviewPageModel(http(403, "FORBIDDEN"), ok(REVISION))).toEqual({ kind: "forbidden" });
    expect(reviewPageModel(http(403, "FORBIDDEN"), http(404, "NOT_FOUND"))).toEqual({ kind: "forbidden" });
    expect(reviewPageModel(http(404, "NOT_FOUND"), ok(REVISION))).toEqual({ kind: "notFound" });
    expect(reviewPageModel(ok(REVIEW), http(404, "NOT_FOUND"))).toEqual({ kind: "notFound" });
    expect(reviewPageModel(http(500, "INTERNAL_ERROR"), ok(REVISION))).toEqual({ kind: "error" });
    expect(reviewPageModel(ok(REVIEW), NETWORK)).toEqual({ kind: "error" });
    // A 403 of the revision read is not the review's 403: an error with Try again.
    expect(reviewPageModel(ok(REVIEW), http(403, "FORBIDDEN"))).toEqual({ kind: "error" });
  });

  it("revisionReviewModel_reread_keepsFormOnlyWhenMayReview: a re-read that answers both shows the new model and keeps the form exactly when the reader may still decide; a failed re-read keeps what is shown, without the form", () => {
    const shown = ready(reviewPageModel(ok(REVIEW), ok(REVISION)));

    const still = rereadOutcome(shown, ok({ ...REVIEW, dataVersion: 10, termsMatch: "NONE" }), ok({ ...REVISION, dataVersion: 10 }));
    expect(still).toMatchObject({ keepForm: true, rereadFailed: false });
    expect(still.model).toMatchObject({ dataVersion: 10, termsMatch: "NONE", mayDecide: true });

    const decided = rereadOutcome(
      shown,
      ok({ ...REVIEW, status: "NEEDS_CHANGES", dataVersion: 10, viewerMayReview: false, notEligibleReasons: ["NOT_PENDING"] }),
      ok({ ...REVISION, status: "NEEDS_CHANGES", dataVersion: 10 }),
    );
    expect(decided).toMatchObject({ keepForm: false, rereadFailed: false });
    expect(decided.model).toMatchObject({ statusKey: "revisionStatuses.NEEDS_CHANGES", mayDecide: false });

    for (const [review, revision] of [
      [http(500, "INTERNAL_ERROR"), ok(REVISION)],
      [ok(REVIEW), NETWORK],
      [http(404, "NOT_FOUND"), ok(REVISION)],
      [SIGNED_OUT, ok(REVISION)],
    ] as [ApiResult<ListingRevisionReview>, ApiResult<ListingRevisionDetail>][]) {
      expect(rereadOutcome(shown, review, revision)).toEqual({ model: shown, keepForm: false, rereadFailed: true });
    }
  });
});
