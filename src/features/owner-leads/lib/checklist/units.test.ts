import { describe, expect, it } from "vitest";

import { P1 } from "./fixtures.test-support";
import { COMMON_TERMS, CHARGES, parseUnitKey, spaceIdOfKey, unitKey } from "./units";

describe("unit keys (plan Task A6 table, spec 4.5, A-29)", () => {
  it("G1", () => {
    expect(
      ["observedAddress", "propertyType", "fit", "rentalScope", "differenceNote", "otherPartsNote", "generalNote"].map(
        (field) => unitKey.field("identification", field),
      ),
    ).toEqual([
      "identification/observedAddress",
      "identification/propertyType",
      "identification/fit",
      "identification/rentalScope",
      "identification/differenceNote",
      "identification/otherPartsNote",
      "identification/generalNote",
    ]);
    expect(unitKey.space(P1)).toBe(`identification/spaces/${P1}`);
  });

  it("G2", () => {
    expect(unitKey.field("parts", "accessRoute")).toBe("parts/accessRoute");
    expect(unitKey.field("parts", "sharedAreas")).toBe("parts/sharedAreas");
    expect(unitKey.field("parts", "totalFloors")).toBe("parts/totalFloors");
    expect(["floor", "privateAreas", "actualAccess"].map((f) => unitKey.spaceField("parts", P1, f))).toEqual([
      `parts/spaces/${P1}/floor`,
      `parts/spaces/${P1}/privateAreas`,
      `parts/spaces/${P1}/actualAccess`,
    ]);
  });

  it("G3", () => {
    expect(
      ["area", "bedrooms", "privateBathrooms", "sharedBathroomUse", "layoutNote"].map((f) =>
        unitKey.spaceField("dimensions", P1, f),
      ),
    ).toEqual([
      `dimensions/spaces/${P1}/area`,
      `dimensions/spaces/${P1}/bedrooms`,
      `dimensions/spaces/${P1}/privateBathrooms`,
      `dimensions/spaces/${P1}/sharedBathroomUse`,
      `dimensions/spaces/${P1}/layoutNote`,
    ]);
  });

  it("G4", () => {
    expect(unitKey.field("condition", "sharedKitchen")).toBe("condition/sharedKitchen");
    expect(unitKey.field("condition", "sharedBathroom")).toBe("condition/sharedBathroom");
    expect(
      ["occupancy", "expectedVacantFrom", "availableFrom", "mainSpace", "kitchen", "bathroom"].map((f) =>
        unitKey.spaceField("condition", P1, f),
      ),
    ).toEqual(
      ["occupancy", "expectedVacantFrom", "availableFrom", "mainSpace", "kitchen", "bathroom"].map(
        (f) => `condition/spaces/${P1}/${f}`,
      ),
    );
  });

  it("G5: the list wrapper and each hazard by its id", () => {
    expect(unitKey.field("safety", "egress")).toBe("safety/egress");
    expect(unitKey.field("safety", "accessRestrictions")).toBe("safety/accessRestrictions");
    expect(unitKey.hazardList).toBe("safety/hazards");
    expect(unitKey.hazard("H1")).toBe("safety/hazards/H1");
  });

  it("G6: items by code and placement, other items by id", () => {
    expect(unitKey.sharedItem("AIR_CONDITIONER")).toBe("amenities/sharedItems/AIR_CONDITIONER");
    expect(unitKey.spaceField("amenities", P1, "furnishing")).toBe(`amenities/spaces/${P1}/furnishing`);
    expect(unitKey.spaceItem(P1, "BED")).toBe(`amenities/spaces/${P1}/items/BED`);
    expect(unitKey.otherItem("X1")).toBe("amenities/otherItems/X1");
  });

  it("G8: the nine common terms, the per-space terms and each override", () => {
    expect(COMMON_TERMS.map((f) => unitKey.commonTerm(f))).toEqual([
      "terms/common/electricity",
      "terms/common/water",
      "terms/common/internet",
      "terms/common/parking",
      "terms/common/serviceFee",
      "terms/common/otherFees",
      "terms/common/houseRules",
      "terms/common/pets",
      "terms/common/handoverMaintenance",
    ]);
    expect(
      ["monthlyRent", "deposit", "paymentPeriodMonths", "minimumTermMonths", "spaceFees"].map((f) =>
        unitKey.spaceField("terms", P1, f),
      ),
    ).toEqual(
      ["monthlyRent", "deposit", "paymentPeriodMonths", "minimumTermMonths", "spaceFees"].map(
        (f) => `terms/spaces/${P1}/${f}`,
      ),
    );
    expect(CHARGES.map((c) => unitKey.override(P1, c))).toEqual(
      ["electricity", "water", "internet", "parking", "serviceFee"].map((c) => `terms/spaces/${P1}/chargeOverrides/${c}`),
    );
  });

  it("parses every kind back", () => {
    expect(parseUnitKey("identification/fit")).toEqual({ kind: "field", group: "identification", field: "fit" });
    expect(parseUnitKey(`identification/spaces/${P1}`)).toEqual({ kind: "space", spaceId: P1 });
    expect(parseUnitKey(`dimensions/spaces/${P1}/area`)).toEqual({
      kind: "spaceField",
      group: "dimensions",
      spaceId: P1,
      field: "area",
    });
    expect(parseUnitKey("safety/hazards")).toEqual({ kind: "hazardList" });
    expect(parseUnitKey("safety/hazards/H1")).toEqual({ kind: "hazard", hazardId: "H1" });
    expect(parseUnitKey("amenities/sharedItems/BED")).toEqual({ kind: "sharedItem", code: "BED" });
    expect(parseUnitKey(`amenities/spaces/${P1}/items/BED`)).toEqual({ kind: "spaceItem", spaceId: P1, code: "BED" });
    expect(parseUnitKey("amenities/otherItems/X1")).toEqual({ kind: "otherItem", itemId: "X1" });
    expect(parseUnitKey("terms/common/pets")).toEqual({ kind: "commonTerm", field: "pets" });
    expect(parseUnitKey(`terms/spaces/${P1}/chargeOverrides/water`)).toEqual({
      kind: "override",
      spaceId: P1,
      charge: "water",
    });
    expect(parseUnitKey("nonsense")).toBeNull();
    expect(parseUnitKey("evidence/photos")).toBeNull();
  });

  it("names the space of a key", () => {
    expect(spaceIdOfKey(`terms/spaces/${P1}/chargeOverrides/water`)).toBe(P1);
    expect(spaceIdOfKey(`identification/spaces/${P1}`)).toBe(P1);
    expect(spaceIdOfKey(`amenities/spaces/${P1}/items/BED`)).toBe(P1);
    expect(spaceIdOfKey("terms/common/water")).toBeNull();
    expect(spaceIdOfKey("amenities/otherItems/X1")).toBeNull();
  });
});
