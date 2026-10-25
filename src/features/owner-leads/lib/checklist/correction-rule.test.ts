import { describe, expect, it } from "vitest";

import type { ChecklistContent, ChecklistGroupPath } from "@/features/surveys";

import { cascadeReasons, type CorrectionReason, correctionReasons } from "./correction-rule";
import { A, B, C, emptyContent, ownerMeta, P1, P2, plain, siteMeta, sourced, VISIT, viewOf } from "./fixtures.test-support";
import { toGroupInput, type GroupEdits } from "./group-input";
import { unitKey } from "./units";

// The page's correction rule (spec 4.5, A-19, A-29) on the units' `meta`, case by case of W16-16, W16-44, W16-46 and
// W16-47 (W16-45). A performed the visit (and so observed every on-site value); B took over; C is a manager.

const CTX = { spaces: [P1, P2], scope: "PARTS" as const };

function reasons(
  group: ChecklistGroupPath,
  content: ChecklistContent,
  edits: GroupEdits,
  viewer = B,
): CorrectionReason[] {
  const input = toGroupInput(group, content[group] as never, edits, CTX);
  return correctionReasons(group, content[group] as never, input, viewer, VISIT, CTX);
}

const kinds = (list: CorrectionReason[]) => [...new Set(list.map((reason) => `${reason.kind}:${reason.name ?? ""}`))];
const SEEN_BY_A = "seen-by-performer:Anh Sale";

const hazard = (overrides: Record<string, unknown> = {}) => ({
  hazardId: "H1",
  spaceId: null,
  previous: null,
  description: "Loose railing",
  severity: "IMPORTANT",
  status: "OPEN",
  statusNote: null,
  ownerReportedOn: null,
  receivedByUserId: null,
  relayBasis: null,
  ...overrides,
});

const fixReport = (on: string, receiver: string, note: string) =>
  hazard({ status: "OWNER_REPORTED_FIXED", ownerReportedOn: on, receivedByUserId: receiver, statusNote: note });

function withHazards(list: Record<string, unknown>[] | [], meta = siteMeta()) {
  const content = emptyContent();
  content.safety.hazards = {
    state: "VALUE",
    naReason: null,
    meta,
    value: list.map((item) => ({ ...item, receivedByName: null, meta: siteMeta() })),
  } as never;
  return content;
}

const rent = (amount: number) => ({ amount, currency: "VND", unit: "MONTH" });
const charge = (basis: string) => ({ basis, amount: null, chargeUnit: null, note: null });
const item = (code: string, presence: string, source = "OBSERVED_ON_SITE", extra: Record<string, unknown> = {}) => ({
  code,
  presence,
  source,
  confirmedOn: null,
  receivedByUserId: null,
  relayBasis: null,
  ...extra,
});

describe("correctionReasons: W16-16", () => {
  it("fillsUnknownAreaFromRecords_isFree", () => {
    const content = emptyContent();
    expect(reasons("dimensions", content, { [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 30, "MEASURED") })).toEqual([]);
  });

  it("changesPerformersPropertyType_needsCorrection", () => {
    const content = emptyContent();
    content.identification.propertyType = { ...plain("VALUE", "HOUSE"), meta: siteMeta() } as never;
    expect(kinds(reasons("identification", content, { "identification/propertyType": plain("VALUE", "VILLA") }))).toEqual([SEEN_BY_A]);
  });

  it("changesPerformersScope_needsCorrection", () => {
    const content = emptyContent();
    const found = reasons("identification", content, {
      "identification/rentalScope": "WHOLE",
      [unitKey.space(P2)]: null,
    });
    expect(found.map((reason) => reason.unitKey)).toEqual(["identification/rentalScope", unitKey.space(P2)]);
  });

  it("changesEachGroupsOnSiteValue_needsCorrection", () => {
    const content = emptyContent();
    content.parts.spaces![0].floor = { ...plain("VALUE", "2"), meta: siteMeta() } as never;
    content.dimensions.spaces![0].area = { ...sourced("VALUE", 30, "MEASURED"), meta: siteMeta({ lastSource: "MEASURED" }) } as never;
    content.condition.spaces![0].kitchen = {
      ...plain("VALUE", { result: "INSPECTED", noneObserved: true, note: null, notEnteredReason: null }),
      meta: siteMeta(),
    } as never;
    content.amenities.sharedItems = [{ ...item("AIR_CONDITIONER", "YES"), meta: siteMeta() }] as never;
    content.terms.spaces![0].monthlyRent = { ...sourced("VALUE", rent(5_000_000), "OBSERVED_ON_SITE"), meta: siteMeta() } as never;
    content.terms.common!.electricity = { ...sourced("VALUE", charge("INCLUDED"), "OBSERVED_ON_SITE"), meta: siteMeta() } as never;
    const hazards = withHazards([hazard()]);

    expect(kinds(reasons("parts", content, { [unitKey.spaceField("parts", P1, "floor")]: plain("VALUE", "3") }))).toEqual([SEEN_BY_A]);
    expect(kinds(reasons("dimensions", content, { [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 31, "MEASURED") }))).toEqual([SEEN_BY_A]);
    expect(
      kinds(
        reasons("condition", content, {
          [unitKey.spaceField("condition", P1, "kitchen")]: plain("VALUE", { result: "NOT_ENTERED", noneObserved: null, note: null, notEnteredReason: "Locked" }),
        }),
      ),
    ).toEqual([SEEN_BY_A]);
    expect(kinds(reasons("safety", hazards, { [unitKey.hazard("H1")]: hazard({ severity: "MINOR" }) }))).toEqual([SEEN_BY_A]);
    expect(kinds(reasons("amenities", content, { [unitKey.sharedItem("AIR_CONDITIONER")]: item("AIR_CONDITIONER", "NO") }))).toEqual([SEEN_BY_A]);
    expect(kinds(reasons("terms", content, { [unitKey.spaceField("terms", P1, "monthlyRent")]: sourced("VALUE", rent(6_000_000), "OBSERVED_ON_SITE") }))).toEqual([SEEN_BY_A]);
    expect(kinds(reasons("terms", content, { [unitKey.commonTerm("electricity")]: sourced("VALUE", charge("PROVIDER_TARIFF"), "OBSERVED_ON_SITE") }))).toEqual([SEEN_BY_A]);
  });

  it("removesPerformersSpace_needsCorrection_alsoForWhatTheCascadeClears", () => {
    const content = emptyContent();
    content.dimensions.spaces![1].area = { ...sourced("VALUE", 20, "MEASURED"), meta: siteMeta() } as never;
    expect(kinds(reasons("identification", content, { [unitKey.space(P2)]: null }))).toEqual([SEEN_BY_A]);
    const view = viewOf(content);
    const nextG1 = toGroupInput("identification", content.identification, { [unitKey.space(P2)]: null }, CTX);
    expect(cascadeReasons(view, nextG1, B).map((reason) => reason.unitKey)).toEqual([unitKey.spaceField("dimensions", P2, "area")]);
  });

  it("secondChangeOfCorrectedValue_needsCorrectionAgain", () => {
    const content = emptyContent();
    content.dimensions.spaces![0].area = {
      ...sourced("VALUE", 31, "MEASURED"),
      meta: siteMeta({ enteredByUserId: B, enteredByName: "Binh Leader", correctionSaveId: "5" }),
    } as never;
    expect(kinds(reasons("dimensions", content, { [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 32, "MEASURED") }))).toEqual([SEEN_BY_A]);
  });

  it("onSiteChargeTurnedIntoOwnerStatement_needsCorrection", () => {
    const content = emptyContent();
    content.terms.common!.electricity = { ...sourced("VALUE", charge("INCLUDED"), "OBSERVED_ON_SITE"), meta: siteMeta() } as never;
    const next = sourced("VALUE", charge("INCLUDED"), "OWNER_STATED", { confirmedOn: "2026-10-24", receivedByUserId: B });
    expect(kinds(reasons("terms", content, { [unitKey.commonTerm("electricity")]: next }))).toEqual([SEEN_BY_A]);
  });

  it("ownerStatement_laterDateOwnReceiver_isFree", () => {
    const content = emptyContent();
    content.terms.spaces![0].monthlyRent = {
      ...sourced("VALUE", rent(5_000_000), "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: A }),
      meta: ownerMeta(A, "2026-10-20"),
    } as never;
    const next = sourced("VALUE", rent(5_500_000), "OWNER_STATED", { confirmedOn: "2026-10-24", receivedByUserId: B });
    expect(reasons("terms", content, { [unitKey.spaceField("terms", P1, "monthlyRent")]: next })).toEqual([]);
  });

  it("ownerStatement_editedKeepingDateAndReceiver_orRemoved_needsCorrection", () => {
    const content = emptyContent();
    const stored = sourced("VALUE", rent(5_000_000), "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: A });
    content.terms.spaces![0].monthlyRent = { ...stored, meta: ownerMeta(A, "2026-10-20") } as never;
    const key = unitKey.spaceField("terms", P1, "monthlyRent");
    expect(kinds(reasons("terms", content, { [key]: { ...stored, value: rent(4_000_000) } }))).toEqual(["heard-by:Anh Sale"]);
    expect(kinds(reasons("terms", content, { [key]: sourced() }))).toEqual(["heard-by:Anh Sale"]);
  });

  it("ownerFormRent_replaced_isFree", () => {
    const content = emptyContent("WHOLE");
    content.terms.spaces![0].monthlyRent = {
      ...sourced("VALUE", rent(5_000_000), "OWNER_FORM"),
      meta: siteMeta({ observedByUserId: null, observedByName: null, lastSource: "OWNER_FORM", formField: "askingPrice" }),
    } as never;
    const input = toGroupInput(
      "terms",
      content.terms,
      { [unitKey.spaceField("terms", P1, "monthlyRent")]: sourced("VALUE", rent(4_000_000), "OBSERVED_ON_SITE") },
      { spaces: [P1], scope: "WHOLE" },
    );
    expect(correctionReasons("terms", content.terms, input, B, VISIT, { spaces: [P1], scope: "WHOLE" })).toEqual([]);
  });

  it("performerAndLastEditor_changesOwnValue_isFree", () => {
    const content = emptyContent();
    content.dimensions.spaces![0].area = { ...sourced("VALUE", 30, "MEASURED"), meta: siteMeta() } as never;
    expect(reasons("dimensions", content, { [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 33, "MEASURED") }, A)).toEqual([]);
  });

  it("starterNotPerformer_ownTypedOnSiteValue_needsCorrection", () => {
    const content = emptyContent();
    content.parts.accessRoute = { ...plain("VALUE", "Lane"), meta: siteMeta({ enteredByUserId: B, enteredByName: "Binh Leader" }) } as never;
    expect(kinds(reasons("parts", content, { "parts/accessRoute": plain("VALUE", "Main road") }))).toEqual([SEEN_BY_A]);
  });
});

describe("correctionReasons: W16-44", () => {
  it("clearedOnSiteArea_refilled_needsCorrection", () => {
    const content = emptyContent();
    content.dimensions.spaces![0].area = {
      ...sourced(),
      meta: siteMeta({ enteredByUserId: B, enteredByName: "Binh Leader", lastSource: "MEASURED" }),
    } as never;
    expect(kinds(reasons("dimensions", content, { [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 30, "MEASURED") }))).toEqual([SEEN_BY_A]);
  });

  it("noneSeenHazardList_firstHazardAdded_needsCorrection", () => {
    const content = withHazards([]);
    const found = reasons("safety", content, { [unitKey.hazard("H2")]: hazard({ hazardId: "H2" }) });
    expect(found.map((reason) => reason.unitKey)).toEqual(["safety/hazards"]);
  });

  it("hazardAddedToNonEmptyList_isFree", () => {
    const content = withHazards([hazard()]);
    expect(reasons("safety", content, { [unitKey.hazard("H2")]: hazard({ hazardId: "H2" }) })).toEqual([]);
  });

  it("feeListChanged_needsCorrection", () => {
    const content = emptyContent();
    content.terms.common!.otherFees = {
      ...sourced("VALUE", [{ name: "Cleaning", amount: { amount: 100000, currency: "VND" }, chargeUnit: "PER_MONTH" }], "OBSERVED_ON_SITE"),
      meta: siteMeta(),
    } as never;
    const next = sourced("VALUE", [{ name: "Cleaning", amount: { amount: 120000, currency: "VND" }, chargeUnit: "PER_MONTH" }], "OBSERVED_ON_SITE");
    expect(kinds(reasons("terms", content, { [unitKey.commonTerm("otherFees")]: next }))).toEqual([SEEN_BY_A]);
  });

  it("chargeOverride_underOthersCommonCharge_needsCorrection", () => {
    const content = emptyContent();
    content.terms.common!.electricity = { ...sourced("VALUE", charge("INCLUDED"), "OBSERVED_ON_SITE"), meta: siteMeta() } as never;
    const found = reasons("terms", content, { [unitKey.override(P1, "electricity")]: sourced("VALUE", charge("PROVIDER_TARIFF"), "OBSERVED_ON_SITE") });
    expect(found.map((reason) => reason.unitKey)).toEqual([unitKey.commonTerm("electricity")]);
  });

  it("chargeOverride_newStatementAgainstOwnerStatedCommon_isFree", () => {
    const content = emptyContent();
    content.terms.common!.water = {
      ...sourced("VALUE", charge("INCLUDED"), "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: A }),
      meta: ownerMeta(A, "2026-10-20"),
    } as never;
    const next = sourced("VALUE", charge("PROVIDER_TARIFF"), "OWNER_STATED", { confirmedOn: "2026-10-24", receivedByUserId: B });
    expect(reasons("terms", content, { [unitKey.override(P1, "water")]: next })).toEqual([]);
  });

  it("fixReport_firstReportOnOthersHazard_isFree", () => {
    const content = withHazards([hazard()]);
    expect(reasons("safety", content, { [unitKey.hazard("H1")]: fixReport("2026-10-24", B, "Owner says fixed") })).toEqual([]);
  });

  it("fixReport_removed_needsCorrection", () => {
    const content = withHazards([fixReport("2026-10-23", A, "Welded")]);
    expect(kinds(reasons("safety", content, { [unitKey.hazard("H1")]: hazard() }))).toEqual([SEEN_BY_A]);
  });

  it("clearedOwnerFormRent_refilled_isFree", () => {
    const content = emptyContent();
    content.terms.spaces![0].monthlyRent = {
      ...sourced(),
      meta: siteMeta({ observedByUserId: null, observedByName: null, lastSource: "OWNER_FORM", formField: "askingPrice" }),
    } as never;
    expect(reasons("terms", content, { [unitKey.spaceField("terms", P1, "monthlyRent")]: sourced("VALUE", rent(1), "OBSERVED_ON_SITE") })).toEqual([]);
  });

  it("clearedOwnerStatement_laterDateRefill_isFree_sameDateRefill_needsCorrection", () => {
    const content = emptyContent();
    content.terms.spaces![0].deposit = { ...sourced(), meta: ownerMeta(A, "2026-10-20") } as never;
    const key = unitKey.spaceField("terms", P1, "deposit");
    const deposit = (on: string) =>
      sourced("VALUE", { basis: "MONTHS", months: 2, amount: null }, "OWNER_STATED", { confirmedOn: on, receivedByUserId: B });
    expect(reasons("terms", content, { [key]: deposit("2026-10-24") })).toEqual([]);
    expect(kinds(reasons("terms", content, { [key]: deposit("2026-10-20") }))).toEqual(["heard-by:Anh Sale"]);
  });

  it("sharedWetAreaBackAsClearedUnit_refilled_needsCorrection", () => {
    const content = emptyContent();
    content.condition.sharedKitchen = { ...plain(), meta: siteMeta({ enteredByUserId: B, enteredByName: "Binh Leader" }) } as never;
    const next = plain("VALUE", { result: "INSPECTED", noneObserved: true, note: null, notEnteredReason: null });
    expect(kinds(reasons("condition", content, { "condition/sharedKitchen": next }))).toEqual([SEEN_BY_A]);
  });

  it("overrideBackAfterRoundTrip_pageCannotSeeTombstone_asksNothing", () => {
    const content = emptyContent();
    expect(reasons("terms", content, { [unitKey.override(P1, "electricity")]: sourced("VALUE", charge("INCLUDED"), "OBSERVED_ON_SITE") })).toEqual([]);
  });

  it("ownerStatement_sameDateAndValueOtherReceiver_needsCorrection", () => {
    const content = emptyContent();
    const stored = sourced("VALUE", 2, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: A });
    content.dimensions.spaces![0].bedrooms = { ...stored, meta: ownerMeta(A, "2026-10-20") } as never;
    const next = { ...stored, receivedByUserId: B };
    expect(kinds(reasons("dimensions", content, { [unitKey.spaceField("dimensions", P1, "bedrooms")]: next }))).toEqual(["heard-by:Anh Sale"]);
  });

  it("ownerStatement_sameDayOtherReceiverOtherValue_isFree", () => {
    const content = emptyContent();
    const stored = sourced("VALUE", 2, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: A });
    content.dimensions.spaces![0].bedrooms = { ...stored, meta: ownerMeta(A, "2026-10-20") } as never;
    const next = { ...stored, value: 3, receivedByUserId: B };
    expect(reasons("dimensions", content, { [unitKey.spaceField("dimensions", P1, "bedrooms")]: next })).toEqual([]);
  });

  it("fixReport_newerReports_areFree_reattributions_needCorrection", () => {
    const content = withHazards([fixReport("2026-10-23", A, "Welded")]);
    const key = unitKey.hazard("H1");
    expect(reasons("safety", content, { [key]: fixReport("2026-10-24", A, "Welded") })).toEqual([]);
    expect(reasons("safety", content, { [key]: fixReport("2026-10-23", B, "Replaced") })).toEqual([]);
    expect(kinds(reasons("safety", content, { [key]: fixReport("2026-10-23", B, "Welded") })).length).toBeGreaterThan(0);
    expect(kinds(reasons("safety", content, { [key]: fixReport("2026-10-23", A, "Replaced") })).length).toBeGreaterThan(0);
  });

  it("fixReport_performerEditsReportHeardByC_needsCorrection", () => {
    const content = withHazards([fixReport("2026-10-23", C, "Welded")]);
    content.safety.hazards!.value![0].receivedByName = "Chi Manager";
    const key = unitKey.hazard("H1");
    expect(kinds(reasons("safety", content, { [key]: fixReport("2026-10-23", C, "Re-welded") }, A))).toEqual(["heard-by:Chi Manager"]);
    expect(kinds(reasons("safety", content, { [key]: null }, A))).toEqual(["heard-by:Chi Manager"]);
  });

  it("fixReport_unchanged_descriptionEditByPerformer_isFree", () => {
    const content = withHazards([fixReport("2026-10-23", C, "Welded")]);
    const edited = { ...fixReport("2026-10-23", C, "Welded"), description: "Loose railing on the stairs" };
    expect(reasons("safety", content, { [unitKey.hazard("H1")]: edited }, A)).toEqual([]);
  });

  it("g6PresenceChangedBySameDayOtherReceiver_isFree", () => {
    const content = emptyContent();
    content.amenities.spaces![0].items = [
      { ...item("BED", "YES", "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: A }), meta: ownerMeta(A, "2026-10-20") },
    ] as never;
    const next = item("BED", "NO", "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: B, relayBasis: null });
    expect(reasons("amenities", content, { [unitKey.spaceItem(P1, "BED")]: next })).toEqual([]);
  });

  it("note_othersNote_isFree", () => {
    const content = emptyContent();
    content.identification.generalNote = "Blue gate";
    content.identification.fieldMeta = { ...content.identification.fieldMeta, generalNote: siteMeta({ observedByUserId: null, lastSource: null }) };
    expect(reasons("identification", content, { "identification/generalNote": "Green gate" })).toEqual([]);
  });

  it("normalisedEqualValue_isNoChange", () => {
    const content = emptyContent();
    content.parts.accessRoute = { ...plain("VALUE", "Hẻm nhỏ"), meta: siteMeta() } as never;
    expect(reasons("parts", content, { "parts/accessRoute": plain("VALUE", "Hẻm nhỏ ") })).toEqual([]);
  });
});

describe("correctionReasons: W16-46, W16-47 (entries removed and put back)", () => {
  it("removingOthersItemOtherItemOrHazard_needsCorrection", () => {
    const content = withHazards([hazard()]);
    content.amenities.sharedItems = [{ ...item("AIR_CONDITIONER", "YES"), meta: siteMeta() }] as never;
    content.amenities.otherItems = [
      { itemId: "X1", label: "Fan", spaceId: null, presence: "YES", source: "OBSERVED_ON_SITE", confirmedOn: null, receivedByUserId: null, relayBasis: null, meta: siteMeta() },
    ] as never;
    expect(kinds(reasons("amenities", content, { [unitKey.sharedItem("AIR_CONDITIONER")]: null }))).toEqual([SEEN_BY_A]);
    expect(kinds(reasons("amenities", content, { [unitKey.otherItem("X1")]: null }))).toEqual([SEEN_BY_A]);
    expect(kinds(reasons("safety", content, { [unitKey.hazard("H1")]: null }))).toEqual([SEEN_BY_A]);
  });

  it("puttingBackARemovedEntry_asksNothing_theServerChecksItsTombstone", () => {
    const content = withHazards([hazard({ hazardId: "H9" })]);
    expect(reasons("amenities", content, { [unitKey.sharedItem("AIR_CONDITIONER")]: item("AIR_CONDITIONER", "YES") })).toEqual([]);
    expect(reasons("safety", content, { [unitKey.hazard("H1")]: hazard() })).toEqual([]);
  });

  it("names the entered-by reason when only the last editor is someone else", () => {
    const content = emptyContent();
    content.identification.observedAddress = {
      ...sourced("VALUE", { addressText: "1 A", provinceCode: "48", wardCode: "1", latitude: null, longitude: null }, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: A }),
      meta: ownerMeta(A, "2026-10-20", C),
    } as never;
    const next = sourced("VALUE", { addressText: "2 A", provinceCode: "48", wardCode: "1", latitude: null, longitude: null }, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: A });
    expect(kinds(reasons("identification", content, { "identification/observedAddress": next }, A))).toEqual(["entered-by:Chi Manager"]);
  });
});
