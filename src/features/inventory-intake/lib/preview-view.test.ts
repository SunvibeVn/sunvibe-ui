import { describe, expect, it } from "vitest";

import type { IntakePreview } from "../types";

import { previewView } from "./preview-view";

const preview: IntakePreview = {
  previewHash: "hash",
  owner: { state: "CONFIRMED", check: "DONE", accountAddressMasked: "o***@example.com" },
  property: { code: null, title: "Nhà 12 Lê Lợi", assetType: "WHOLE_BUILDING", layout: "PARTS", address: "12 Lê Lợi", ward: "Hải Châu" },
  source: { revisionId: "R1", decidedAt: "2026-11-01T02:00:00Z", address: "12 Lê Lợi" },
  units: [
    {
      spaceCode: "P101",
      unitCode: null,
      location: "Floor 1",
      areaSqm: 25,
      bedrooms: 1,
      bathrooms: 1,
      condition: "UNDER_RENOVATION",
      amenities: ["AIR_CONDITIONER", "Balcony"],
      availability: "AVAILABLE",
      sources: [{ field: "areaSqm", source: "ON_SITE", date: "2026-11-01" }],
    },
    {
      spaceCode: "P102",
      unitCode: "SV-1-P102",
      location: "Floor 1",
      amenities: [],
      availability: "BLOCKED",
      sources: [],
    },
  ],
  termsReference: [
    { name: "monthlyRent", value: { amount: 5000000, currency: "VND", unit: "MONTH" }, unit: "P101", source: "OWNER_STATED", date: "2026-11-01" },
    { name: "deposit", value: null, unit: null, source: null, date: null },
  ],
  notCarried: ["PHOTOS", "NOTES", "CONTACT", "TERMS"],
  warnings: ["TERMS_UNCONFIRMED", "SAME_PHONE_LEAD"],
};

describe("previewView", () => {
  it("preview_showsSourcesOwnerNotCarriedWarnings: names the owner state and the masked account", () => {
    expect(previewView(preview).owner).toEqual({ masked: "o***@example.com", confirmed: true, checked: true });
  });

  it("preview_showsSourcesOwnerNotCarriedWarnings: keeps each value's source with its date", () => {
    expect(previewView(preview).units[0].sources).toEqual([{ field: "Area sqm", source: "On site", date: "2026-11-01" }]);
    expect(previewView(preview).source).toEqual({ revisionId: "R1", decidedAt: "2026-11-01T02:00:00Z", address: "12 Lê Lợi" });
  });

  it("preview_showsSourcesOwnerNotCarriedWarnings: lists what is not carried and the warnings as label keys", () => {
    const view = previewView(preview);
    expect(view.notCarried).toEqual(["notCarried.PHOTOS", "notCarried.NOTES", "notCarried.CONTACT", "notCarried.TERMS"]);
    expect(view.warnings).toEqual(["warnings.TERMS_UNCONFIRMED", "warnings.SAME_PHONE_LEAD"]);
  });

  it("preview_showsSourcesOwnerNotCarriedWarnings: drops a warning this UI does not know", () => {
    expect(previewView({ ...preview, warnings: ["NEW_WARNING" as never] }).warnings).toEqual([]);
  });

  it("preview_conditionAndAmenitiesPerUnit: each unit reads its own condition and amenities, never a neighbour's", () => {
    const [p101, p102] = previewView(preview).units;
    expect(p101).toMatchObject({ spaceCode: "P101", condition: "Under renovation", amenities: ["Air conditioner", "Balcony"] });
    expect(p102).toMatchObject({ spaceCode: "P102", condition: null, amenities: [] });
  });

  it("preview_conditionAndAmenitiesPerUnit: a code drawn at completion reads as not set yet", () => {
    const [p101, p102] = previewView(preview).units;
    expect(p101.unitCode).toBeNull();
    expect(p102.unitCode).toBe("SV-1-P102");
    expect(previewView(preview).property.code).toBeNull();
  });

  it("preview_termsAreReferenceOnly: terms sit apart from the property and its units, with source and date", () => {
    const view = previewView(preview);
    expect(view.terms).toEqual([
      { name: "Monthly rent", value: "5,000,000 VND / Month", unit: "P101", source: "Owner stated", date: "2026-11-01" },
      { name: "Deposit", value: null, unit: null, source: null, date: null },
    ]);
    expect(JSON.stringify(view.property)).not.toContain("5,000,000");
    expect(JSON.stringify(view.units)).not.toContain("5,000,000");
  });

  it("holds the hash the completion binds to", () => {
    expect(previewView(preview).hash).toBe("hash");
    expect(previewView({}).hash).toBeNull();
  });

  it("reads an empty answer without failing", () => {
    expect(previewView({})).toMatchObject({ units: [], terms: [], notCarried: [], warnings: [] });
  });
});
