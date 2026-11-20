import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingDetail, ListingFeatures, ListingRevisionDetail, ListingTerms } from "../types";

import { formValues } from "./revision-form";
import { revisionPanelModel, revisionPanelOf, type RevisionPanelInput, type RevisionPanelModel, termsLines } from "./revision-model";
import { type Phrase, phraseText } from "./revision-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });
const text = (phrase: Phrase) => phraseText(t, phrase);

const LISTING_ID = "01JG000000000000000000000L";

const NOTHING_CHOSEN: ListingFeatures = {
  furnishing: null,
  airConditioner: false,
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
};

const TERMS: ListingTerms = {
  monthlyRent: { amount: 4500000, currency: "VND", unit: "MONTH" },
  deposit: { basis: "MONTHS", months: 2, amount: null, currency: null },
  minimumTermMonths: 6,
  paymentPeriodMonths: 3,
  mandatoryFees: [
    { name: "Nước", basis: "AMOUNT", amount: 25000, currency: "VND", chargeUnit: "PER_M3" },
    { name: "Internet", basis: "INCLUDED", amount: null, currency: null, chargeUnit: null },
  ],
};

/** A Draft with a title only, as RD-1's read answers it. */
const DRAFT: ListingRevisionDetail = {
  listingId: LISTING_ID,
  revisionNo: 1,
  status: "DRAFT",
  createdAt: "2026-11-20T03:15:00Z",
  updatedAt: "2026-11-21T03:15:00Z",
  title: "Phòng trọ",
  description: null,
  features: { ...NOTHING_CHOSEN, airConditioner: true, kitchen: "PRIVATE" },
  termsSnapshot: null,
  unitSnapshot: null,
  submittedAt: null,
  dataVersion: 4,
  problems: [
    { part: "TITLE", rule: "TOO_SHORT" },
    { part: "DESCRIPTION", rule: "REQUIRED" },
    { part: "TERMS", rule: "REQUIRED" },
  ],
};

/** The same revision submitted: locked, with its terms and unit snapshots and no problems. */
const PENDING: ListingRevisionDetail = {
  ...DRAFT,
  status: "PENDING_REVIEW",
  title: "Phòng trọ gần trường đại học",
  description: "Phòng rộng.\nGần chợ.",
  termsSnapshot: { source: "PENDING_START", pendingStartDate: "2026-12-01", capturedAt: "2026-11-21T02:00:00Z", terms: TERMS },
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
  dataVersion: 6,
  problems: [],
};

const DRAFTER: RevisionPanelInput = { openRevisionNo: 1, dataVersion: 4, viewerMayDraft: true };
const READER: RevisionPanelInput = { openRevisionNo: 1, dataVersion: 4, viewerMayDraft: false };

const answered = (data: ListingRevisionDetail): ApiResult<ListingRevisionDetail> => ({ ok: true, status: 200, replayed: false, data });

function ready(model: RevisionPanelModel) {
  if (model.kind !== "ready") throw new Error(`expected a ready model, got ${model.kind}`);
  return model;
}

describe("revision panel model (listing-publish E06-S2, spec section 6, E06S2-D14)", () => {
  it("revisionPanelOf_listing_mayDraftOnlyAssignedAndNotArchived: the panel's input from the listing read; only the assigned Sale of a listing that is not archived drafts", () => {
    const listing: ListingDetail = {
      listingId: LISTING_ID,
      code: "TD-7K3M-Q9TX",
      state: "UNPUBLISHED",
      transactionType: "LONG_TERM_RENT",
      unitId: "01JE000000000000000000000U",
      agreementId: "01JF000000000000000000000A",
      createdAt: "2026-11-20T03:15:00Z",
      dataVersion: 5,
      viewerIsAssignedSale: true,
      openRevisionNo: 2,
      revisions: [],
      hasOlderRevisions: false,
    };
    expect(revisionPanelOf(listing)).toEqual({ openRevisionNo: 2, dataVersion: 5, viewerMayDraft: true });
    expect(revisionPanelOf({ ...listing, openRevisionNo: null })).toEqual({ openRevisionNo: null, dataVersion: 5, viewerMayDraft: true });
    expect(revisionPanelOf({ ...listing, viewerIsAssignedSale: false }).viewerMayDraft).toBe(false);
    expect(revisionPanelOf({ ...listing, state: "ARCHIVED" }).viewerMayDraft).toBe(false);
    for (const state of ["PUBLISHED", "PAUSED", "URGENTLY_UNPUBLISHED"] as const) {
      expect(revisionPanelOf({ ...listing, state }).viewerMayDraft).toBe(true);
    }
  });

  it("revisionPanelModel_draftForDrafter_editWithProblems: a Draft for the assigned Sale is the form, with its values and the read's problems as sentences", () => {
    const model = ready(revisionPanelModel(answered(DRAFT), DRAFTER));

    expect(model.mode).toBe("edit");
    expect(model.mayWithdraw).toBe(false);
    expect(model.values).toEqual(formValues(DRAFT));
    expect(model.screen).toMatchObject({
      revisionNo: 1,
      statusKey: "revisionStatuses.DRAFT",
      title: "Phòng trọ",
      description: null,
      terms: null,
      unit: null,
      submittedAt: null,
      dataVersion: 4,
    });
    expect(model.screen.problems.map(text)).toEqual([
      "The title needs at least 15 characters.",
      "Add a description.",
      "Take a terms snapshot.",
    ]);
  });

  it("revisionPanelModel_draftForOthers_read: a Draft for anyone but the assigned Sale is read-only, without withdraw", () => {
    const model = ready(revisionPanelModel(answered(DRAFT), READER));
    expect(model.mode).toBe("read");
    expect(model.mayWithdraw).toBe(false);
    expect(model.screen.title).toBe("Phòng trọ");
    expect(model.screen.problems).toHaveLength(3);
  });

  it("revisionPanelModel_pendingForDrafter_readWithWithdraw: a Pending review revision is read-only; the assigned Sale may withdraw it; its snapshots are lines", () => {
    const model = ready(revisionPanelModel(answered(PENDING), { ...DRAFTER, dataVersion: 6 }));

    expect(model.mode).toBe("read");
    expect(model.mayWithdraw).toBe(true);
    expect(model.screen.statusKey).toBe("revisionStatuses.PENDING_REVIEW");
    expect(model.screen.submittedAt).toBe("2026-11-21T03:00:00Z");
    expect(model.screen.description).toBe("Phòng rộng.\nGần chợ.");
    expect(model.screen.problems).toEqual([]);
    expect(model.screen.terms).toMatchObject({
      sourceKey: "revision.terms.sources.PENDING_START",
      pendingStartDate: "2026-12-01",
      capturedAt: "2026-11-21T02:00:00Z",
    });
    expect(model.screen.terms?.lines.map(text)).toEqual(termsLines(TERMS).map(text));
    expect(model.screen.unit?.map(text)).toEqual([
      "House",
      "Phường Bến Thành, Thành phố Hồ Chí Minh",
      "2 bedrooms, 1 bathroom",
      "25.5 m²",
    ]);

    expect(ready(revisionPanelModel(answered(PENDING), READER)).mayWithdraw).toBe(false);
    for (const status of ["CANCELLED", "NEEDS_CHANGES", "APPROVED", "LIVE"] as const) {
      const other = ready(revisionPanelModel(answered({ ...PENDING, status }), DRAFTER));
      expect(other.mode).toBe("read");
      expect(other.mayWithdraw).toBe(false);
    }
    // A unit without a catalog ward and without an asset type shows neither line (E06S2-D12).
    const legacy = ready(
      revisionPanelModel(
        answered({
          ...PENDING,
          unitSnapshot: {
            ...(PENDING.unitSnapshot as NonNullable<ListingRevisionDetail["unitSnapshot"]>),
            assetType: null,
            provinceCode: null,
            provinceName: null,
            wardCode: null,
            wardName: null,
            bedrooms: 1,
            bathrooms: 2,
          },
        }),
        DRAFTER,
      ),
    );
    expect(legacy.screen.unit?.map(text)).toEqual(["1 bedroom, 2 bathrooms", "25.5 m²"]);
    // The source in effect has no start date.
    const inEffect = ready(
      revisionPanelModel(
        answered({ ...PENDING, termsSnapshot: { source: "IN_EFFECT", pendingStartDate: null, capturedAt: "2026-11-21T02:00:00Z", terms: TERMS } }),
        DRAFTER,
      ),
    );
    expect(inEffect.screen.terms).toMatchObject({ sourceKey: "revision.terms.sources.IN_EFFECT", pendingStartDate: null });
  });

  it("revisionPanelModel_notFoundErrorAndSession_kinds: a 404 is not found; the session answers hide the panel; anything else is an error", () => {
    expect(revisionPanelModel({ ok: false, kind: "http", status: 404, code: "NOT_FOUND", fieldErrors: [] }, DRAFTER)).toEqual({
      kind: "notFound",
    });
    for (const result of [{ ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as ApiResult<ListingRevisionDetail>[]) {
      expect(revisionPanelModel(result, DRAFTER)).toEqual({ kind: "hidden" });
    }
    for (const result of [
      { ok: false, kind: "http", status: 403, code: "FORBIDDEN", fieldErrors: [] },
      { ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [] },
      { ok: false, kind: "network" },
    ] as ApiResult<ListingRevisionDetail>[]) {
      expect(revisionPanelModel(result, DRAFTER)).toEqual({ kind: "error" });
    }
  });

  it("termsLines_eachDepositAndFeeBasis_itsLine: rent, deposit (0 months and amount 0 read 'No deposit'), minimum term, period and each fee by its basis", () => {
    expect(termsLines(TERMS).map(text)).toEqual([
      "Rent: 4,500,000 VND / month",
      "Deposit: 2 months' rent",
      "Minimum term: 6 months",
      "Pay every 3 months",
      "Nước: 25,000 VND per m³",
      "Internet: included in the rent",
    ]);

    const deposit = (value: ListingTerms["deposit"]) => text(termsLines({ ...TERMS, deposit: value })[1] as Phrase);
    expect(deposit({ basis: "MONTHS", months: 0, amount: null, currency: null })).toBe("No deposit");
    expect(deposit({ basis: "AMOUNT", months: null, amount: 0, currency: "VND" })).toBe("No deposit");
    expect(deposit({ basis: "MONTHS", months: 1, amount: null, currency: null })).toBe("Deposit: 1 month's rent");
    expect(deposit({ basis: "AMOUNT", months: null, amount: 5000000, currency: "VND" })).toBe("Deposit: 5,000,000 VND");
    expect(deposit({ basis: "SURETY" as never, months: null, amount: null, currency: null })).toBe("Deposit: in another form");

    const once = termsLines({ ...TERMS, minimumTermMonths: 1, paymentPeriodMonths: 1, mandatoryFees: [] }).map(text);
    expect(once).toEqual(["Rent: 4,500,000 VND / month", "Deposit: 2 months' rent", "Minimum term: 1 month", "Pay every month"]);

    const fees = termsLines({
      ...TERMS,
      mandatoryFees: [
        { name: "Điện", basis: "PROVIDER_TARIFF", amount: null, currency: null, chargeUnit: null },
        { name: "Gửi xe", basis: "AMOUNT", amount: 100000, currency: "VND", chargeUnit: "PER_VEHICLE_PER_MONTH" },
        { name: "Rác", basis: "AMOUNT", amount: 20000, currency: "VND", chargeUnit: "PER_PERSON_PER_MONTH" },
        { name: "Phí", basis: "AMOUNT", amount: 1000, currency: "VND", chargeUnit: "PER_WEEK" as never },
        { name: "Dọn phòng", basis: "WAIVED" as never, amount: null, currency: null, chargeUnit: null },
      ],
    })
      .slice(4)
      .map(text);
    expect(fees).toEqual([
      "Điện: at the provider's rate",
      "Gửi xe: 100,000 VND per vehicle per month",
      "Rác: 20,000 VND per person per month",
      "Phí: 1,000 VND per another unit",
      "Dọn phòng: another kind of fee",
    ]);
  });

  it("revisionPanelModel_featuresNotChosen_notListed: only chosen features are listed, each with its English label, in the form's order", () => {
    const none = ready(revisionPanelModel(answered({ ...DRAFT, features: NOTHING_CHOSEN }), READER));
    expect(none.screen.features).toEqual([]);

    const some = ready(revisionPanelModel(answered(DRAFT), READER));
    expect(some.screen.features.map(text)).toEqual(["Air conditioner", "Kitchen: Private"]);

    const every = ready(
      revisionPanelModel(
        answered({
          ...DRAFT,
          features: {
            furnishing: "BASIC",
            airConditioner: true,
            waterHeater: true,
            fridge: true,
            washingMachine: "SHARED",
            kitchen: "PRIVATE",
            balcony: true,
            elevator: true,
            motorbikeParking: true,
            carParking: true,
            internet: true,
            pets: "NOT_ALLOWED",
            noSharedLandlord: true,
          },
        }),
        READER,
      ),
    );
    expect(every.screen.features.map(text)).toEqual([
      "Furniture: Basic furniture",
      "Air conditioner",
      "Water heater",
      "Fridge",
      "Washing machine: Shared",
      "Kitchen: Private",
      "Balcony",
      "Elevator",
      "Motorbike parking",
      "Car parking",
      "Internet",
      "Pets: Not allowed",
      "Landlord does not live here",
    ]);
  });
});
