import { describe, expect, it } from "vitest";

import { checklistDraftKey } from "./checklist-draft";
import { A, B, C, sourced, VISIT } from "./fixtures.test-support";
import { afterEdit, leadAddressOffer, ownerFormOffer } from "./field-offers";
import { pageNotices, showsUnsourcedReminder } from "./page-notices";
import { needsRelayBasis, receiverOptions, withRelayRule } from "./receiver-options";
import { scopeSwitchWarning } from "./scope-switch";
import { hasUnsavedChanges } from "./unsaved";

const FORM = {
  submittedOn: "2026-10-01",
  addressDetail: "12 Le Duan",
  provinceCode: "48",
  wardCode: "20242",
  latitude: 16.05,
  longitude: 108.2,
  monthlyAskingPrice: { amount: 14_000_000, currency: "VND", unit: "MONTH" },
  availableFrom: "2026-11-20",
};

describe("ownerFormOffer and afterEdit (spec 6.2, A-18, A-27, W16-30)", () => {
  it("offers the address in any scope, rent and available-from only in WHOLE, only with a submitted value", () => {
    expect(ownerFormOffer("address", "PARTS", FORM)).toEqual({
      addressText: "12 Le Duan",
      provinceCode: "48",
      wardCode: "20242",
      latitude: 16.05,
      longitude: 108.2,
    });
    expect(ownerFormOffer("monthlyRent", "WHOLE", FORM)).toEqual({ amount: 14_000_000, currency: "VND", unit: "MONTH" });
    expect(ownerFormOffer("availableFrom", "WHOLE", FORM)).toBe("2026-11-20");
    expect(ownerFormOffer("monthlyRent", "PARTS", FORM)).toBeNull();
    expect(ownerFormOffer("availableFrom", "PARTS", FORM)).toBeNull();
    expect(ownerFormOffer("availableFrom", null, FORM)).toBeNull();
    expect(ownerFormOffer("availableFrom", "WHOLE", { ...FORM, availableFrom: null })).toBeNull();
    expect(ownerFormOffer("monthlyRent", "WHOLE", { ...FORM, monthlyAskingPrice: null })).toBeNull();
    expect(ownerFormOffer("address", "WHOLE", null)).toBeNull();
  });

  it("clears the source when a copied owner's form value is edited", () => {
    const copied = sourced("VALUE", "2026-11-20", "OWNER_FORM");
    expect(afterEdit({ ...copied, value: "2026-11-21" })).toEqual(sourced("VALUE", "2026-11-21", null));
    const seen = sourced("VALUE", "2026-11-20", "OBSERVED_ON_SITE");
    expect(afterEdit(seen)).toBe(seen);
  });

  it("copies the lead address, as the owner's form for a WEB lead, else without a source", () => {
    const lead = { addressText: "12 Le Duan", provinceCode: "48", wardCode: "20242", latitude: 16.05, longitude: 108.2, provinceName: "Da Nang", wardName: "Hai Chau" };
    expect(leadAddressOffer({ ...VISIT, leadLocation: lead }, FORM)).toEqual({
      value: { addressText: "12 Le Duan", provinceCode: "48", wardCode: "20242", latitude: 16.05, longitude: 108.2 },
      source: "OWNER_FORM",
    });
    expect(leadAddressOffer({ ...VISIT, leadLocation: { ...lead, latitude: undefined, longitude: undefined } }, null)).toEqual({
      value: { addressText: "12 Le Duan", provinceCode: "48", wardCode: "20242", latitude: null, longitude: null },
      source: null,
    });
    expect(leadAddressOffer({ ...VISIT, leadLocation: undefined }, null)).toBeNull();
  });
});

describe("receiverOptions and needsRelayBasis (BR-21, A-25, W16-45)", () => {
  it("lists Me first, then the lead's staff, with no preselection", () => {
    expect(
      receiverOptions(
        [
          { userId: C, name: "Chi Manager" },
          { userId: A, name: "Anh Sale" },
          { userId: B, name: null },
        ],
        A,
      ),
    ).toEqual([
      { userId: A, me: true, name: "Anh Sale" },
      { userId: C, me: false, name: "Chi Manager" },
      { userId: B, me: false, name: null },
    ]);
  });

  it("asks how it reached you exactly when the user creates or changes an owner statement naming someone else", () => {
    const heardByC = sourced("VALUE", 3, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: C, relayBasis: "Call note" });
    expect(needsRelayBasis(undefined, heardByC, A)).toBe(true);
    expect(needsRelayBasis(sourced(), heardByC, A)).toBe(true);
    expect(needsRelayBasis(heardByC, heardByC, A)).toBe(false);
    expect(needsRelayBasis(heardByC, { ...heardByC, relayBasis: "Edited" }, A)).toBe(false);
    expect(needsRelayBasis(heardByC, { ...heardByC, value: 4 }, A)).toBe(true);
    expect(needsRelayBasis(sourced(), { ...heardByC, receivedByUserId: A }, A)).toBe(false);
    expect(needsRelayBasis(sourced(), sourced("VALUE", 3, "OBSERVED_ON_SITE"), A)).toBe(false);
  });

  it("applies the same to an owner fix report of a hazard", () => {
    const open = { hazardId: "H1", status: "OPEN", ownerReportedOn: null, receivedByUserId: null, relayBasis: null, statusNote: null };
    const reported = { ...open, status: "OWNER_REPORTED_FIXED", ownerReportedOn: "2026-10-24", receivedByUserId: C, statusNote: "Fixed" };
    expect(needsRelayBasis(open, reported, A)).toBe(true);
    expect(needsRelayBasis(open, { ...reported, receivedByUserId: A }, A)).toBe(false);
    expect(needsRelayBasis(reported, { ...reported, relayBasis: "x" }, A)).toBe(false);
  });
});

describe("scopeSwitchWarning (spec 6.4)", () => {
  it("warns for each switch, not for a first choice", () => {
    expect(scopeSwitchWarning("PARTS", "WHOLE")).toBe("toWhole");
    expect(scopeSwitchWarning("WHOLE", "PARTS")).toBe("toParts");
    expect(scopeSwitchWarning(null, "PARTS")).toBeNull();
    expect(scopeSwitchWarning("PARTS", "PARTS")).toBeNull();
  });
});

describe("pageNotices and showsUnsourcedReminder (BR-23, US-2 AC-4, W16-31, W16-45)", () => {
  it("shows the legal and media banners on every view and the starts-empty banner on a later visit", () => {
    expect(pageNotices({ earlier: null })).toEqual({ legal: true, media: true, laterVisit: null });
    expect(pageNotices({ earlier: { appointmentNo: 1, checklistNo: 1 } })).toEqual({
      legal: true,
      media: true,
      laterVisit: { surveyNo: 1, checklistNo: 1 },
    });
  });

  it("reminds beside the unsourced inputs other than notes", () => {
    for (const field of ["propertyType", "fit", "rentalScope", "spaces", "accessRoute", "floor", "actualAccess", "mainSpace", "kitchen", "sharedKitchen", "occupancy", "egress", "accessRestrictions", "hazards"]) {
      expect(showsUnsourcedReminder(field), field).toBe(true);
    }
    for (const field of ["generalNote", "differenceNote", "otherPartsNote", "layoutNote", "area", "bedrooms", "monthlyRent", "observedAddress", "furnishing", "availableFrom"]) {
      expect(showsUnsourcedReminder(field), field).toBe(false);
    }
  });
});

describe("hasUnsavedChanges (the leave guard, W16-27)", () => {
  it("is true while any group draft holds edits", () => {
    const key = checklistDraftKey({ userId: A, leadId: "L", checklistId: "C", group: "terms" });
    expect(hasUnsavedChanges([])).toBe(false);
    expect(hasUnsavedChanges([""])).toBe(false);
    expect(hasUnsavedChanges(["", JSON.stringify({ version: 1, edits: { x: 1 }, created: [] })])).toBe(true);
    expect(key.form).toBe("checklist:C:terms");
  });

});

describe("withRelayRule (A-18: a changed statement the viewer heard keeps no relay basis)", () => {
  it("clears the relay basis of a changed statement or report whose receiver is the viewer", () => {
    const stored = sourced("VALUE", 3, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: B, relayBasis: "A call note" });
    const changed = { ...stored, value: 4, confirmedOn: "2026-10-24" };
    expect(withRelayRule(changed, stored, B)).toEqual({ ...changed, relayBasis: null });
    const report = { hazardId: "H1", status: "OWNER_REPORTED_FIXED", ownerReportedOn: "2026-10-24", receivedByUserId: B, relayBasis: "x", statusNote: "Fixed" };
    expect(withRelayRule(report, { ...report, ownerReportedOn: "2026-10-23" }, B)).toEqual({ ...report, relayBasis: null });
  });

  it("gives back the stored unit when an edit is reverted (no edit, no correction)", () => {
    const stored = sourced("VALUE", 3, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: B, relayBasis: "A call note" });
    const edited = withRelayRule({ ...stored, value: 4 }, stored, B);
    expect(edited.relayBasis).toBeNull();
    expect(withRelayRule({ ...edited, value: 3 }, stored, B)).toBe(stored);
  });

  it("keeps an unchanged unit and a statement someone else heard as they are", () => {
    const stored = sourced("VALUE", 3, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: B, relayBasis: "A call note" });
    expect(withRelayRule(stored, stored, B)).toBe(stored);
    const other = { ...stored, value: 4, receivedByUserId: C };
    expect(withRelayRule(other, stored, B)).toBe(other);
    expect(withRelayRule(null, stored, B)).toBeNull();
  });
});
