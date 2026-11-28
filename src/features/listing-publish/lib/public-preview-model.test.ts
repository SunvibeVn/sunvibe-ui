import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { ListingFeatures, ListingPublicPreview } from "../types";

import { type PreviewRow, publicPreviewModel } from "./public-preview-model";
import { phraseText } from "./revision-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });
const r = en.ListingPublish.revision;
const v = en.ListingPublish.preview;

const FEATURES: ListingFeatures = {
  furnishing: "BASIC",
  airConditioner: true,
  waterHeater: false,
  fridge: false,
  washingMachine: null,
  kitchen: "PRIVATE",
  balcony: false,
  elevator: false,
  motorbikeParking: false,
  carParking: false,
  internet: false,
  pets: null,
  noSharedLandlord: false,
};

/** The live revision of a shown listing, as the preview answers it. */
const LIVE: ListingPublicPreview = {
  revisionNo: 2,
  revisionStatus: "LIVE",
  code: "TD-ABCD-EFGH",
  transactionType: "LONG_TERM_RENT",
  propertyType: "APARTMENT",
  provinceCode: "79",
  provinceName: "Thành phố Hồ Chí Minh",
  wardCode: "26734",
  wardName: "Phường Bến Thành",
  bedrooms: 2,
  bathrooms: 1,
  areaSqm: 1234.5,
  terms: {
    monthlyRent: { amount: 4500000, currency: "VND", unit: "MONTH" },
    deposit: { basis: "MONTHS", months: 2, amount: null, currency: null },
    minimumTermMonths: 6,
    paymentPeriodMonths: 1,
    mandatoryFees: [{ name: "Điện", basis: "AMOUNT", amount: 3500, chargeUnit: "PER_KWH", currency: "VND" }],
  },
  title: "Phòng trọ gần trường đại học",
  description: "Phòng rộng.\nGần chợ.",
  features: FEATURES,
  liveOn: "2026-11-22",
  lastConfirmedOn: "2026-11-21",
};

/** A Draft never submitted: no unit snapshot, no terms, no description, never live, no valid confirmation. */
const DRAFT: ListingPublicPreview = {
  ...LIVE,
  revisionNo: 3,
  revisionStatus: "DRAFT",
  propertyType: null,
  provinceCode: null,
  provinceName: null,
  wardCode: null,
  wardName: null,
  bedrooms: null,
  bathrooms: null,
  areaSqm: null,
  terms: null,
  title: "Phòng mới",
  description: null,
  liveOn: null,
  lastConfirmedOn: null,
};

/** A row's label and its value as the page reads it; the terms and features lines one per line. */
function read(row: PreviewRow): [string, string | null] {
  const label = t(row.labelKey);
  const value = row.value;
  switch (value.kind) {
    case "text":
    case "paragraphs":
      return [label, value.text];
    case "phrase":
      return [label, phraseText(t, value.phrase)];
    case "lines":
      return [label, value.lines.map((line) => phraseText(t, line)).join("\n")];
    case "terms":
      return [label, value.lines === null ? null : value.lines.map((line) => phraseText(t, line)).join("\n")];
  }
}

describe("public preview model (listing-publish US-2 AC-3, spec section 6, E06S7-D16 (a), PB-22)", () => {
  it("publicPreviewModel_live_groupsInOrder: the code, rental, type, place with its codes, rooms and area, terms, title, description, features and the two dates, in the order of spec section 6", () => {
    expect(publicPreviewModel(LIVE).map(read)).toEqual([
      [v.labels.code, "TD-ABCD-EFGH"],
      [v.labels.rental, "Long-term rental"],
      [v.labels.type, "Apartment"],
      [v.labels.place, "Phường Bến Thành (26734), Thành phố Hồ Chí Minh (79)"],
      [v.labels.bedrooms, "2"],
      [v.labels.bathrooms, "1"],
      [v.labels.area, "1,234.5"],
      [v.labels.terms, ["Rent: 4,500,000 VND / month", "Deposit: 2 months' rent", "Minimum term: 6 months", "Pay every month", "Điện: 3,500 VND per kWh"].join("\n")],
      [v.labels.title, "Phòng trọ gần trường đại học"],
      [v.labels.description, "Phòng rộng.\nGần chợ."],
      [v.labels.features, [`${r.features.labels.furnishing}: ${r.features.options.BASIC}`, r.features.labels.airConditioner, `${r.features.labels.kitchen}: ${r.features.options.PRIVATE}`].join("\n")],
      [v.labels.liveOn, "Nov 22, 2026"],
      [v.labels.lastConfirmed, "Nov 21, 2026"],
    ]);
    expect(publicPreviewModel(LIVE).map((row) => row.labelKey)).toEqual([
      "preview.labels.code",
      "preview.labels.rental",
      "preview.labels.type",
      "preview.labels.place",
      "preview.labels.bedrooms",
      "preview.labels.bathrooms",
      "preview.labels.area",
      "preview.labels.terms",
      "preview.labels.title",
      "preview.labels.description",
      "preview.labels.features",
      "preview.labels.liveOn",
      "preview.labels.lastConfirmed",
    ]);
    // The description keeps its line breaks.
    expect(publicPreviewModel(LIVE)[9]?.value.kind).toBe("paragraphs");
  });

  it("publicPreviewModel_draftWithoutUnitSnapshot_oneSentence: a Draft never submitted gives the unit sentence in place of type, place, rooms and area; no terms, 'Not written yet.', 'Not live' and no confirmation", () => {
    expect(publicPreviewModel(DRAFT).map(read)).toEqual([
      [v.labels.code, "TD-ABCD-EFGH"],
      [v.labels.rental, "Long-term rental"],
      [v.labels.unit, "Type, place, rooms and area are taken from the unit when the revision is submitted."],
      [v.labels.terms, null],
      [v.labels.title, "Phòng mới"],
      [v.labels.description, "Not written yet."],
      [v.labels.features, [`${r.features.labels.furnishing}: ${r.features.options.BASIC}`, r.features.labels.airConditioner, `${r.features.labels.kitchen}: ${r.features.options.PRIVATE}`].join("\n")],
      [v.labels.liveOn, "Not live"],
      [v.labels.lastConfirmed, "No valid freshness confirmation yet."],
    ]);
    const nothing = { ...DRAFT, title: null, features: { ...FEATURES, furnishing: null, airConditioner: false, kitchen: null } };
    expect(publicPreviewModel(nothing).map(read).filter(([label]) => label === v.labels.title || label === v.labels.features)).toEqual([
      [v.labels.title, "Not written yet."],
      [v.labels.features, "No feature chosen."],
    ]);
  });

  it("publicPreviewModel_snapshotWithoutPlaceOrType_sentences: a unit snapshot without a place reads 'No ward or province is recorded for the unit.'; a legacy property without a type says so too", () => {
    const placeless = { ...LIVE, provinceCode: null, provinceName: null, wardCode: null, wardName: null, propertyType: null };
    const rows = new Map(publicPreviewModel(placeless).map(read));
    expect(rows.get(v.labels.place)).toBe("No ward or province is recorded for the unit.");
    expect(rows.get(v.labels.type)).toBe("No property type is recorded for the unit.");
    expect(rows.get(v.labels.bedrooms)).toBe("2");
    expect(rows.has(v.labels.unit)).toBe(false);
  });

  it("publicPreviewModel_withoutTerms_null: a preview without a terms snapshot gives no terms lines (the terms display shows 'No terms snapshot yet.')", () => {
    const row = publicPreviewModel({ ...LIVE, terms: null }).find((entry) => entry.labelKey === "preview.labels.terms");
    expect(row?.value).toEqual({ kind: "terms", lines: null });
    const shown = publicPreviewModel(LIVE).find((entry) => entry.labelKey === "preview.labels.terms");
    expect(shown?.value.kind === "terms" && shown.value.lines?.length).toBe(5);
  });

  it("publicPreviewModel_dates_utcMediumDay: both dates are calendar days shown in UTC dateStyle medium, so the day never shifts", () => {
    const rows = new Map(publicPreviewModel({ ...LIVE, liveOn: "2026-01-01", lastConfirmedOn: "2026-12-31" }).map(read));
    expect(rows.get(v.labels.liveOn)).toBe("Jan 1, 2026");
    expect(rows.get(v.labels.lastConfirmed)).toBe("Dec 31, 2026");
  });
});
