import { describe, expect, it } from "vitest";

import { emptyContent, P1, P2, plain, sourced } from "../../lib/checklist/fixtures.test-support";
import { toGroupInput } from "../../lib/checklist/group-input";
import { unitKey } from "../../lib/checklist/units";

import { checkCorrection, checkGroupInput, spaceCodeSchema } from "./index";

const CTX = { spaces: [P1, P2], scope: "PARTS" as const };
const RULES = { today: "2026-10-24", arrivalDate: "2026-10-23", viewerUserId: "me" };
const first = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error?.issues[0].message;

function problems(group: Parameters<typeof toGroupInput>[0], edits: Record<string, unknown>) {
  const content = emptyContent("PARTS");
  return checkGroupInput(group, toGroupInput(group, content[group] as never, edits, CTX) as never, RULES);
}

describe("spaceCodeSchema (spec 4.6, Review Focus 5)", () => {
  it("spaceCodeSchema_vietnameseLetters_refusedWithHint", () => {
    expect(first(spaceCodeSchema.safeParse("Phòng 101"))).toBe("codeChars");
    expect(first(spaceCodeSchema.safeParse("P101"))).toBeNull();
    expect(first(spaceCodeSchema.safeParse("A-1 ./_"))).toBeNull();
    expect(first(spaceCodeSchema.safeParse(""))).toBe("required");
    expect(first(spaceCodeSchema.safeParse("x".repeat(21)))).toBe("tooLong");
  });
});

describe("checkGroupInput (spec 4.6 limits, A-11 phone rule; paths as the server's)", () => {
  it("is empty for an empty draft", () => {
    for (const group of ["identification", "parts", "dimensions", "condition", "safety", "amenities", "terms"] as const) {
      expect(problems(group, {}), group).toEqual({});
    }
  });

  it("checks the spaces of G1: code characters, duplicates ignoring case, location, phone", () => {
    expect(
      problems("identification", {
        [unitKey.space(P1)]: { spaceId: P1, code: "Phòng 1", location: "Floor 1", description: null },
        [unitKey.space(P2)]: { spaceId: P2, code: "p1", location: "", description: "call 0905 123 456" },
      }),
    ).toEqual({
      "content.spaces.0.code": "codeChars",
      "content.spaces.1.location": "required",
      "content.spaces.1.description": "phone",
    });
    expect(
      problems("identification", {
        [unitKey.space(P1)]: { spaceId: P1, code: "A1", location: "x", description: null },
        [unitKey.space(P2)]: { spaceId: P2, code: "a1", location: "y", description: null },
      }),
    ).toEqual({ "content.spaces.1.code": "duplicate" });
  });

  it("refuses a phone number in a note and over-long text", () => {
    expect(problems("identification", { "identification/generalNote": "Owner 0905 123 456" })).toEqual({ "content.generalNote": "phone" });
    expect(problems("parts", { "parts/accessRoute": plain("VALUE", "x".repeat(1001)) })).toEqual({ "content.accessRoute.value": "tooLong" });
    expect(problems("dimensions", { [unitKey.spaceField("dimensions", P1, "layoutNote")]: "y".repeat(1001) })).toEqual({
      "content.spaces.0.layoutNote": "tooLong",
    });
  });

  it("asks for the value, the source and the reason a state needs", () => {
    expect(problems("parts", { "parts/accessRoute": plain("VALUE", "") })).toEqual({ "content.accessRoute.value": "required" });
    expect(problems("parts", { "parts/sharedAreas": { state: "NOT_APPLICABLE", value: null, naReason: "" } })).toEqual({
      "content.sharedAreas.naReason": "required",
    });
    expect(problems("dimensions", { [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 30, null) })).toEqual({
      "content.spaces.0.area.source": "required",
    });
    expect(
      problems("dimensions", { [unitKey.spaceField("dimensions", P1, "bedrooms")]: sourced("VALUE", 2, "OWNER_STATED") }),
    ).toEqual({
      "content.spaces.0.bedrooms.confirmedOn": "required",
      "content.spaces.0.bedrooms.receivedByUserId": "required",
    });
  });

  it("checks owner-stated dates against today and the 2000 floor (A-7)", () => {
    const stated = (on: string) =>
      sourced("VALUE", 2, "OWNER_STATED", { confirmedOn: on, receivedByUserId: "me" });
    const key = unitKey.spaceField("dimensions", P1, "bedrooms");
    expect(problems("dimensions", { [key]: stated("2026-10-25") })).toEqual({ "content.spaces.0.bedrooms.confirmedOn": "tooLate" });
    expect(problems("dimensions", { [key]: stated("1999-12-31") })).toEqual({ "content.spaces.0.bedrooms.confirmedOn": "tooEarly" });
    expect(problems("dimensions", { [key]: stated("2010-01-01") })).toEqual({});
  });

  it("asks how it reached you when the receiver is someone else, and refuses it otherwise (A-18)", () => {
    const key = unitKey.spaceField("dimensions", P1, "bedrooms");
    expect(
      problems("dimensions", { [key]: sourced("VALUE", 2, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: "other" }) }),
    ).toEqual({ "content.spaces.0.bedrooms.relayBasis": "required" });
    expect(
      problems("dimensions", {
        [key]: sourced("VALUE", 2, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: "me", relayBasis: "x" }),
      }),
    ).toEqual({ "content.spaces.0.bedrooms.relayBasis": "notAllowed" });
  });

  it("checks number ranges and the area's one decimal", () => {
    expect(problems("dimensions", { [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 30.25, "MEASURED") })).toEqual({
      "content.spaces.0.area.value": "invalid",
    });
    expect(problems("dimensions", { [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 0, "MEASURED") })).toEqual({
      "content.spaces.0.area.value": "invalid",
    });
    expect(problems("dimensions", { [unitKey.spaceField("dimensions", P1, "bedrooms")]: sourced("VALUE", 51, "OBSERVED_ON_SITE") })).toEqual({
      "content.spaces.0.bedrooms.value": "invalid",
    });
    expect(problems("parts", { "parts/totalFloors": sourced("VALUE", 0, "OBSERVED_ON_SITE") })).toEqual({ "content.totalFloors.value": "invalid" });
  });

  it("checks the area checks of G4 (BR-17)", () => {
    const key = unitKey.spaceField("condition", P1, "kitchen");
    expect(
      problems("condition", { [key]: plain("VALUE", { result: "NOT_ENTERED", noneObserved: null, note: null, notEnteredReason: "" }) }),
    ).toEqual({ "content.spaces.0.kitchen.value.notEnteredReason": "required" });
    expect(
      problems("condition", { [key]: plain("VALUE", { result: "INSPECTED", noneObserved: false, note: "", notEnteredReason: null }) }),
    ).toEqual({ "content.spaces.0.kitchen.value.note": "required" });
    expect(
      problems("condition", { [key]: plain("VALUE", { result: "INSPECTED", noneObserved: null, note: null, notEnteredReason: null }) }),
    ).toEqual({ "content.spaces.0.kitchen.value.noneObserved": "required" });
  });

  it("checks the money of G8 (D-1)", () => {
    const rentKey = unitKey.spaceField("terms", P1, "monthlyRent");
    expect(problems("terms", { [rentKey]: sourced("VALUE", { amount: 0, currency: "VND", unit: "MONTH" }, "OBSERVED_ON_SITE") })).toEqual({
      "content.spaces.0.monthlyRent.value.amount": "invalid",
    });
    expect(
      problems("terms", {
        "terms/common/electricity": sourced("VALUE", { basis: "AMOUNT", amount: { amount: 3500, currency: "VND" }, chargeUnit: null, note: null }, "OBSERVED_ON_SITE"),
      }),
    ).toEqual({ "content.common.electricity.value.chargeUnit": "required" });
    expect(
      problems("terms", { [unitKey.spaceField("terms", P1, "deposit")]: sourced("VALUE", { basis: "MONTHS", months: 13, amount: null }, "OBSERVED_ON_SITE") }),
    ).toEqual({ "content.spaces.0.deposit.value.months": "invalid" });
  });

  it("checks a hazard's description, status note and owner report", () => {
    const hazard = {
      hazardId: "H1",
      spaceId: null,
      previous: null,
      description: "",
      severity: "IMPORTANT",
      status: "OWNER_REPORTED_FIXED",
      statusNote: null,
      ownerReportedOn: null,
      receivedByUserId: null,
      relayBasis: null,
    };
    expect(problems("safety", { [unitKey.hazard("H1")]: hazard })).toEqual({
      "content.hazards.value.0.description": "required",
      "content.hazards.value.0.statusNote": "required",
      "content.hazards.value.0.ownerReportedOn": "required",
      "content.hazards.value.0.receivedByUserId": "required",
    });
  });
});

describe("checkCorrection (BR-22: reason, date and basis)", () => {
  it("needs a reason and a basis dated from the visit to today", () => {
    expect(checkCorrection({ reason: "", basis: { confirmedOn: "", text: "" } }, RULES)).toEqual({
      reason: "required",
      "basis.confirmedOn": "required",
      "basis.text": "required",
    });
    expect(checkCorrection({ reason: "Remeasured", basis: { confirmedOn: "2026-10-22", text: "x" } }, RULES)).toEqual({
      "basis.confirmedOn": "tooEarly",
    });
    expect(checkCorrection({ reason: "Remeasured", basis: { confirmedOn: "2026-10-24", text: "Owner call" } }, RULES)).toEqual({});
  });
});

describe("checkGroupInput: receiver and relay only on statements the save creates or changes (A-18, review finding 1)", () => {
  const key = unitKey.spaceField("terms", P1, "monthlyRent");
  const rent = { amount: 5_000_000, currency: "VND", unit: "MONTH" };
  const body = (unit: unknown) =>
    toGroupInput("terms", emptyContent("PARTS").terms, { [key]: unit, "terms/common/houseRules": sourced("VALUE", "No smoking", "OBSERVED_ON_SITE") }, CTX);

  it("lets the new holder save a group whose earlier statement (heard by its author, no relay) is unchanged", () => {
    const stored = sourced("VALUE", rent, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: "previous" });
    const unchanged = new Set(["content.spaces.0.monthlyRent"]);
    expect(checkGroupInput("terms", body(stored) as never, { ...RULES, unchangedPaths: unchanged })).toEqual({});
  });

  it("lets it save when an unchanged statement heard by the new holder keeps its relay", () => {
    const stored = sourced("VALUE", rent, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: "me", relayBasis: "Call note" });
    expect(checkGroupInput("terms", body(stored) as never, { ...RULES, unchangedPaths: new Set(["content.spaces.0.monthlyRent"]) })).toEqual({});
  });

  it("still checks a statement the save changes", () => {
    const changed = sourced("VALUE", rent, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: "previous" });
    expect(checkGroupInput("terms", body(changed) as never, { ...RULES, unchangedPaths: new Set() })).toEqual({
      "content.spaces.0.monthlyRent.relayBasis": "required",
    });
  });
});
