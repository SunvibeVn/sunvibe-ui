import { describe, expect, it } from "vitest";

import { effectiveTermsBySpace } from "./effective-terms-view";
import { emptyContent, P1, P2, sourced, viewOf } from "./fixtures.test-support";
import { fieldAnchor, readinessView } from "./readiness-view";

describe("readinessView (spec 4.7, 6.2 Preview)", () => {
  it("lists each missing item with the space code and the anchor of its field in Edit", () => {
    const view = viewOf(emptyContent(), 1, {
      readiness: {
        submissionAvailable: false,
        missing: [
          { group: "IDENTIFICATION", spaceId: null, field: "propertyType", problem: "NOT_CHECKED" },
          { group: "CONDITION", spaceId: P2, field: "kitchen", problem: "REQUIRED_AREA_NOT_ENTERED" },
          { group: "EVIDENCE", spaceId: null, field: null, problem: "EVIDENCE_PENDING" },
        ],
        unconfirmedTerms: [{ group: "TERMS", spaceId: P1, field: "monthlyRent" }],
        warnings: [
          { type: "OPEN_IMPORTANT_HAZARD", hazardId: "H1", spaceId: null, checklistId: null, checklistNo: null },
          { type: "PARTIAL_ACCESS", spaceId: P1, hazardId: null, checklistId: null, checklistNo: null },
          { type: "EARLIER_HAZARD_OPEN", checklistId: "C0", checklistNo: 1, hazardId: "H0", spaceId: null },
        ],
      },
    });
    const model = readinessView(view);
    expect(model.missing).toEqual([
      { group: "identification", spaceCode: null, field: "propertyType", problem: "NOT_CHECKED", anchor: fieldAnchor("identification", null, "propertyType") },
      { group: "condition", spaceCode: "P2", field: "kitchen", problem: "REQUIRED_AREA_NOT_ENTERED", anchor: fieldAnchor("condition", P2, "kitchen") },
      { group: "evidence", spaceCode: null, field: null, problem: "EVIDENCE_PENDING", anchor: "cl-evidence" },
    ]);
    expect(model.unconfirmed).toEqual([
      { group: "terms", spaceCode: "P1", field: "monthlyRent", anchor: fieldAnchor("terms", P1, "monthlyRent") },
    ]);
    expect(model.warnings).toEqual([
      { type: "OPEN_IMPORTANT_HAZARD", hazardId: "H1", spaceCode: null, checklistNo: null },
      { type: "PARTIAL_ACCESS", hazardId: null, spaceCode: "P1", checklistNo: null },
      { type: "EARLIER_HAZARD_OPEN", hazardId: "H0", spaceCode: null, checklistNo: 1 },
    ]);
  });

  it("gives anchors safe for an element id", () => {
    expect(fieldAnchor("dimensions", P1, "area")).toBe(`cl-dimensions-${P1}-area`);
    expect(fieldAnchor("safety", null, "egress")).toBe("cl-safety-asset-egress");
  });
});

describe("effectiveTermsBySpace (spec 4.7: override else common, with its origin; fees common plus space)", () => {
  it("reads each space's effective charges and fees", () => {
    const included = { ...sourced("VALUE", { basis: "INCLUDED", amount: null, chargeUnit: null, note: null }, "OBSERVED_ON_SITE"), meta: null };
    const view = viewOf(emptyContent(), 1, {
      effectiveTerms: [
        {
          spaceId: P1,
          electricity: { term: included as never, origin: "SPACE" },
          water: { term: sourced() as never, origin: "COMMON" },
          internet: { term: sourced() as never, origin: "COMMON" },
          parking: { term: sourced() as never, origin: "COMMON" },
          serviceFee: { term: sourced() as never, origin: "COMMON" },
          fees: { common: sourced("VALUE", [], "OBSERVED_ON_SITE") as never, space: null },
        },
      ],
    });
    const [first] = effectiveTermsBySpace(view);
    expect(first.spaceCode).toBe("P1");
    expect(first.charges.map((entry) => [entry.charge, entry.origin])).toEqual([
      ["electricity", "SPACE"],
      ["water", "COMMON"],
      ["internet", "COMMON"],
      ["parking", "COMMON"],
      ["serviceFee", "COMMON"],
    ]);
    expect(first.charges[0].term).toBe(included);
    expect(first.fees.space).toBeNull();
  });
});
