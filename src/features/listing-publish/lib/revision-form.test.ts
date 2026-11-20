import { describe, expect, it } from "vitest";

import type { ListingFeatures, ListingRevisionDetail } from "../types";

import { codePointCount, contentBody, formValues, type RevisionFormValues } from "./revision-form";

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

const EVERY_FEATURE: ListingFeatures = {
  furnishing: "FULL",
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
};

/** A Draft as the revision read answers it. */
const DRAFT: ListingRevisionDetail = {
  listingId: "01JG000000000000000000000L",
  revisionNo: 1,
  status: "DRAFT",
  createdAt: "2026-11-20T03:15:00Z",
  updatedAt: "2026-11-21T03:15:00Z",
  title: "Phòng trọ gần trường đại học",
  description: "Dòng một\nDòng hai",
  features: EVERY_FEATURE,
  termsSnapshot: null,
  unitSnapshot: null,
  submittedAt: null,
  dataVersion: 4,
  problems: [],
};

describe("revision form (listing-publish E06-S2, spec section 6, E06S2-P11 (1))", () => {
  it("contentBody_blankTexts_null: an empty or blank title or description is sent as null; other text as typed", () => {
    const blank: RevisionFormValues = { title: "", description: " \n\t  ", features: NOTHING_CHOSEN };
    expect(contentBody(blank, 3)).toEqual({ dataVersion: 3, title: null, description: null, features: NOTHING_CHOSEN });

    const typed: RevisionFormValues = { title: "  Phòng trọ  ", description: "Một\r\nHai", features: NOTHING_CHOSEN };
    expect(contentBody(typed, 0)).toMatchObject({ dataVersion: 0, title: "  Phòng trọ  ", description: "Một\r\nHai" });
  });

  it("contentBody_notStatedOptions_null: 'Not stated' sends null for each option feature, every feature is in the body", () => {
    const body = contentBody({ title: "A", description: "B", features: NOTHING_CHOSEN }, 1);
    expect(body.features).toEqual(NOTHING_CHOSEN);
    expect(Object.keys(body.features).sort()).toEqual(Object.keys(NOTHING_CHOSEN).sort());
    for (const option of ["furnishing", "washingMachine", "kitchen", "pets"] as const) expect(body.features[option]).toBeNull();

    const chosen = contentBody({ title: "A", description: "B", features: EVERY_FEATURE }, 1);
    expect(chosen.features).toEqual(EVERY_FEATURE);
  });

  it("formValues_detail_roundTrip: a Draft's read gives the form's values, which give back the same content body", () => {
    const values = formValues(DRAFT);
    expect(values).toEqual({ title: DRAFT.title, description: DRAFT.description, features: EVERY_FEATURE });
    expect(contentBody(values, DRAFT.dataVersion)).toEqual({
      dataVersion: 4,
      title: DRAFT.title,
      description: DRAFT.description,
      features: EVERY_FEATURE,
    });

    const empty = formValues({ ...DRAFT, title: null, description: null, features: NOTHING_CHOSEN });
    expect(empty).toEqual({ title: "", description: "", features: NOTHING_CHOSEN });
    expect(contentBody(empty, 4)).toEqual({ dataVersion: 4, title: null, description: null, features: NOTHING_CHOSEN });

    // Only the thirteen features of the contract go into the values, whatever else an answer carries.
    const extra = formValues({ ...DRAFT, features: { ...EVERY_FEATURE, sauna: true } as ListingFeatures });
    expect(Object.keys(extra.features).sort()).toEqual(Object.keys(EVERY_FEATURE).sort());
  });

  it("codePointCount_emojiAndNfd_oneEach: the counters count code points of the NFC text", () => {
    expect(codePointCount("")).toBe(0);
    expect(codePointCount("abc")).toBe(3);
    // An emoji is two UTF-16 units and one character.
    expect(codePointCount("Phòng 😀")).toBe(7);
    // "ò" typed as o + U+0300 is one character after NFC.
    expect(codePointCount("Phòng")).toBe(5);
    expect(codePointCount("Phòng")).toBe(codePointCount("Phòng"));
    expect(codePointCount("Dòng một\nDòng hai")).toBe(17);
  });
});
