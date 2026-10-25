import { describe, expect, it } from "vitest";

import { CHECKLIST_GROUP_PATHS } from "@/features/surveys";

import { emptyContent, ownerMeta, P1, P2, plain, siteMeta, sourced, B } from "./fixtures.test-support";
import { inputOfContent, readUnit, toGroupInput, unitsOfInput } from "./group-input";
import { unitKey } from "./units";

const PLAIN = ["naReason", "state", "value"];
const SOURCED = ["confirmedOn", "naReason", "receivedByUserId", "relayBasis", "source", "state", "value"];
const SERVER_ONLY = ["meta", "fieldMeta", "difference", "provinceName", "wardName", "receivedByName"];

/** Every key path of a JSON value, arrays read by position. */
function paths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => paths(item, `${prefix}${index}.`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => [`${prefix}${key}`, ...paths(item, `${prefix}${key}.`)]);
}

const keysOf = (value: object) => Object.keys(value).sort();

function contentWithEverything() {
  const content = emptyContent("PARTS");
  content.identification.observedAddress = {
    ...sourced("VALUE", { addressText: "12 Le Duan", provinceCode: "48", wardCode: "20242", latitude: 16.05, longitude: 108.2 }, "OBSERVED_ON_SITE"),
    meta: siteMeta(),
  } as never;
  content.identification.provinceName = "Da Nang";
  content.identification.wardName = "Hai Chau";
  content.parts.accessRoute = { ...plain("VALUE", "Lane from the main road"), meta: siteMeta() } as never;
  content.dimensions.spaces![0].area = { ...sourced("VALUE", 35.5, "MEASURED"), meta: siteMeta() } as never;
  content.dimensions.spaces![0].fieldMeta = { layoutNote: siteMeta() };
  content.safety.hazards = {
    state: "VALUE",
    naReason: null,
    meta: siteMeta(),
    value: [
      {
        hazardId: "H1",
        spaceId: P1,
        previous: null,
        description: "Loose railing",
        severity: "IMPORTANT",
        status: "OWNER_REPORTED_FIXED",
        statusNote: "Owner says welded",
        ownerReportedOn: "2026-10-23",
        receivedByUserId: B,
        receivedByName: "Binh Leader",
        relayBasis: null,
        meta: siteMeta(),
      },
    ],
  } as never;
  content.amenities.sharedItems = [
    { code: "AIR_CONDITIONER", presence: "YES", source: "OBSERVED_ON_SITE", confirmedOn: null, receivedByUserId: null, relayBasis: null, meta: siteMeta() },
  ];
  content.amenities.otherItems = [
    { itemId: "X1", label: "Fan", spaceId: P2, presence: "YES", source: "OWNER_STATED", confirmedOn: "2026-10-22", receivedByUserId: B, relayBasis: "Call note", meta: ownerMeta(B, "2026-10-22") },
  ];
  content.terms.spaces![0].monthlyRent = { ...sourced("VALUE", { amount: 5000000, currency: "VND", unit: "MONTH" }, "OBSERVED_ON_SITE"), meta: siteMeta() } as never;
  return content;
}

describe("toGroupInput (A-4, W16-27)", () => {
  it("builds every input key with no meta, server field or unsourced source, for every group", () => {
    const content = contentWithEverything();
    const ctx = { spaces: [P1, P2], scope: "PARTS" as const };
    for (const group of CHECKLIST_GROUP_PATHS) {
      const input = toGroupInput(group, content[group] as never, {}, ctx);
      const all = paths(input);
      for (const key of SERVER_ONLY) {
        expect(all.filter((path) => path.split(".").includes(key)), `${group} ${key}`).toEqual([]);
      }
    }
    const g1 = toGroupInput("identification", content.identification, {}, ctx);
    expect(keysOf(g1)).toEqual(
      ["differenceNote", "fit", "generalNote", "observedAddress", "otherPartsNote", "propertyType", "rentalScope", "spaces"].sort(),
    );
    expect(keysOf(g1.observedAddress)).toEqual(SOURCED);
    expect(keysOf(g1.propertyType)).toEqual(PLAIN);
    expect(keysOf(g1.spaces[0])).toEqual(["code", "description", "location", "spaceId"]);

    const g2 = toGroupInput("parts", content.parts, {}, ctx);
    expect(keysOf(g2.accessRoute)).toEqual(PLAIN);
    expect(keysOf(g2.totalFloors)).toEqual(SOURCED);
    expect(keysOf(g2.spaces[0])).toEqual(["actualAccess", "floor", "privateAreas", "spaceId"]);

    const g3 = toGroupInput("dimensions", content.dimensions, {}, ctx);
    expect(keysOf(g3.spaces[0])).toEqual(
      ["area", "bedrooms", "layoutNote", "privateBathrooms", "sharedBathroomUse", "spaceId"].sort(),
    );
    expect(keysOf(g3.spaces[0].area)).toEqual(SOURCED);

    const g4 = toGroupInput("condition", content.condition, {}, ctx);
    expect(keysOf(g4.sharedKitchen!)).toEqual(PLAIN);
    expect(keysOf(g4.spaces[0].availableFrom)).toEqual(SOURCED);
    expect(keysOf(g4.spaces[0].mainSpace)).toEqual(PLAIN);

    const g5 = toGroupInput("safety", content.safety, {}, ctx);
    expect(keysOf(g5.hazards)).toEqual(PLAIN);
    expect(keysOf(g5.hazards.value![0])).toEqual(
      ["description", "hazardId", "ownerReportedOn", "previous", "receivedByUserId", "relayBasis", "severity", "spaceId", "status", "statusNote"].sort(),
    );

    const g6 = toGroupInput("amenities", content.amenities, {}, ctx);
    expect(keysOf(g6.sharedItems[0])).toEqual(["code", "confirmedOn", "presence", "receivedByUserId", "relayBasis", "source"]);
    expect(keysOf(g6.otherItems[0])).toEqual(
      ["confirmedOn", "itemId", "label", "presence", "receivedByUserId", "relayBasis", "source", "spaceId"].sort(),
    );
    expect(keysOf(g6.spaces[0].furnishing)).toEqual(SOURCED);

    const g8 = toGroupInput("terms", content.terms, {}, ctx);
    expect(keysOf(g8.common)).toEqual(
      ["electricity", "handoverMaintenance", "houseRules", "internet", "otherFees", "parking", "pets", "serviceFee", "water"].sort(),
    );
    expect(keysOf(g8.spaces[0])).toEqual(
      ["chargeOverrides", "deposit", "minimumTermMonths", "monthlyRent", "paymentPeriodMonths", "spaceFees", "spaceId"].sort(),
    );
    expect(g8.spaces[0].chargeOverrides).toEqual({ electricity: null, water: null, internet: null, parking: null, serviceFee: null });
  });

  it("overlays the edits by unit key over the loaded content", () => {
    const content = contentWithEverything();
    const ctx = { spaces: [P1, P2], scope: "PARTS" as const };
    const area = sourced("VALUE", 40, "ESTIMATED");
    const g3 = toGroupInput("dimensions", content.dimensions, { [unitKey.spaceField("dimensions", P2, "area")]: area }, ctx);
    expect(g3.spaces[1].area).toEqual(area);
    expect(g3.spaces[0].area).toEqual(sourced("VALUE", 35.5, "MEASURED"));

    const g6 = toGroupInput(
      "amenities",
      content.amenities,
      {
        [unitKey.sharedItem("AIR_CONDITIONER")]: null,
        [unitKey.sharedItem("ELEVATOR")]: { code: "ELEVATOR", presence: "NO", source: "OBSERVED_ON_SITE", confirmedOn: null, receivedByUserId: null, relayBasis: null },
        [unitKey.spaceItem(P1, "BED")]: { code: "BED", presence: "YES", source: "OBSERVED_ON_SITE", confirmedOn: null, receivedByUserId: null, relayBasis: null },
      },
      ctx,
    );
    expect(g6.sharedItems.map((item) => item.code)).toEqual(["ELEVATOR"]);
    expect(g6.spaces[0].items.map((item) => item.code)).toEqual(["BED"]);

    const g1 = toGroupInput(
      "identification",
      content.identification,
      {
        [unitKey.space(P2)]: null,
        [unitKey.space("NEW1")]: { spaceId: "NEW1", code: "P3", location: "Roof", description: null },
        [unitKey.field("identification", "rentalScope")]: "PARTS",
        [unitKey.field("identification", "generalNote")]: "Gate is blue",
      },
      ctx,
    );
    expect(g1.spaces.map((space) => space.spaceId)).toEqual([P1, "NEW1"]);
    expect(g1.generalNote).toBe("Gate is blue");

    const g8 = toGroupInput(
      "terms",
      content.terms,
      { [unitKey.override(P2, "water")]: sourced("VALUE", { basis: "INCLUDED", amount: null, chargeUnit: null, note: null }, "OBSERVED_ON_SITE") },
      ctx,
    );
    expect(g8.spaces[1].chargeOverrides?.water?.value?.basis).toBe("INCLUDED");
  });

  it("keeps the hazard list and its entries apart: the wrapper edit sets state, entries stay", () => {
    const content = contentWithEverything();
    const ctx = { spaces: [P1, P2], scope: "PARTS" as const };
    const added = {
      hazardId: "H2",
      spaceId: null,
      previous: null,
      description: "Wet floor",
      severity: "MINOR" as const,
      status: "OPEN" as const,
      statusNote: null,
      ownerReportedOn: null,
      receivedByUserId: null,
      relayBasis: null,
    };
    const g5 = toGroupInput("safety", content.safety, { [unitKey.hazard("H2")]: added }, ctx);
    expect(g5.hazards.value!.map((hazard) => hazard.hazardId)).toEqual(["H1", "H2"]);
    const none = toGroupInput(
      "safety",
      emptyContent("PARTS").safety,
      { [unitKey.hazardList]: { state: "VALUE", naReason: null } },
      ctx,
    );
    expect(none.hazards).toEqual({ state: "VALUE", value: [], naReason: null });
  });

  it("gives every G1 space an entry in G1 order and drops entries of a space G1 no longer has (PD-5)", () => {
    const content = emptyContent("PARTS");
    const dims = toGroupInput("dimensions", content.dimensions, {}, { spaces: [P2, "NEW1"], scope: "PARTS" });
    expect(dims.spaces.map((space) => space.spaceId)).toEqual([P2, "NEW1"]);
    expect(dims.spaces[1].area).toEqual(sourced());
  });

  it("follows the scope for the PARTS-only units (spec 4.6, A-12)", () => {
    const parts = emptyContent("PARTS");
    const whole = toGroupInput("condition", parts.condition, {}, { spaces: [P1], scope: "WHOLE" });
    expect(whole.sharedKitchen).toBeNull();
    expect(whole.sharedBathroom).toBeNull();
    const terms = toGroupInput("terms", parts.terms, {}, { spaces: [P1], scope: "WHOLE" });
    expect(terms.spaces[0].chargeOverrides).toBeNull();
    expect(terms.spaces[0].spaceFees).toBeNull();

    const wholeContent = emptyContent("WHOLE");
    wholeContent.terms.spaces![0].monthlyRent = { ...sourced("VALUE", { amount: 1, currency: "VND", unit: "MONTH" }, "OWNER_FORM"), meta: siteMeta() } as never;
    const toParts = toGroupInput("terms", wholeContent.terms, {}, { spaces: [P1, "NEW1"], scope: "PARTS" });
    expect(toParts.spaces[0].chargeOverrides).toEqual({ electricity: null, water: null, internet: null, parking: null, serviceFee: null });
    expect(toParts.spaces[0].monthlyRent).toEqual(sourced());
    const cond = toGroupInput("condition", wholeContent.condition, {}, { spaces: [P1, "NEW1"], scope: "PARTS" });
    expect(cond.sharedKitchen).toEqual(plain());
  });

  it("detaches hazards and drops other items of a space G1 no longer has (A-12)", () => {
    const content = contentWithEverything();
    const g5 = inputOfContent("safety", content.safety, { spaces: [P2], scope: "PARTS" });
    expect(g5.hazards.value![0].spaceId).toBeNull();
    const g6 = inputOfContent("amenities", content.amenities, { spaces: [P1], scope: "PARTS" });
    expect(g6.otherItems).toEqual([]);
  });
});

describe("unitsOfInput and readUnit", () => {
  it("lists every unit of a group by key, entries by identity", () => {
    const content = contentWithEverything();
    const ctx = { spaces: [P1, P2], scope: "PARTS" as const };
    const units = unitsOfInput("amenities", toGroupInput("amenities", content.amenities, {}, ctx));
    expect([...units.keys()]).toEqual([
      unitKey.sharedItem("AIR_CONDITIONER"),
      unitKey.spaceField("amenities", P1, "furnishing"),
      unitKey.spaceField("amenities", P2, "furnishing"),
      unitKey.otherItem("X1"),
    ]);
    const safety = unitsOfInput("safety", toGroupInput("safety", content.safety, {}, ctx));
    expect([...safety.keys()]).toEqual(["safety/egress", "safety/accessRestrictions", "safety/hazards", "safety/hazards/H1"]);
    expect(safety.get("safety/hazards")).toEqual({ state: "VALUE", naReason: null, none: false });
    expect(readUnit("safety", toGroupInput("safety", content.safety, {}, ctx), "safety/hazards/H1")).toMatchObject({
      description: "Loose railing",
    });
    const terms = unitsOfInput("terms", toGroupInput("terms", content.terms, {}, ctx));
    expect(terms.has(unitKey.override(P1, "water"))).toBe(true);
    expect(terms.get(unitKey.override(P1, "water"))).toBeNull();
  });
});
