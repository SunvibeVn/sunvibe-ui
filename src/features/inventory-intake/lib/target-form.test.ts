import { describe, expect, it } from "vitest";

import type { IntakeBlock, InventorySearchItem } from "../types";

import { initialTarget, pickProperty, searchProblem, searchQuery, targetBody, targetProblems } from "./target-form";

const parts: IntakeBlock = {
  version: 7,
  selection: { spaceIds: ["S1", "S2"] },
  source: { rentalScope: "PARTS", spaces: [{ spaceId: "S1" }, { spaceId: "S2" }, { spaceId: "S3" }] },
};
const whole: IntakeBlock = { version: 7, selection: { spaceIds: ["S1"] }, source: { rentalScope: "WHOLE", spaces: [{ spaceId: "S1" }] } };
const found: InventorySearchItem = { propertyId: "P1", propertyCode: "SV-1", units: [{ unitId: "U1" }, { unitId: "U2" }] };

describe("the target form", () => {
  it("starts on the only way a bound intake has", () => {
    expect(initialTarget({ ...parts, forcedPropertyCode: "SV-1" }).mode).toBe("LINK");
    expect(initialTarget(parts).mode).toBe("");
  });

  it("wants a choice", () => {
    expect(targetProblems(initialTarget(whole), whole)).toEqual({ mode: "required" });
  });

  it("creates a whole property with no main space", () => {
    const form = { ...initialTarget(whole), mode: "CREATE" as const };
    expect(targetProblems(form, whole)).toEqual({});
    expect(targetBody(form, whole)).toEqual({ mode: "CREATE", expectedVersion: 7 });
  });

  it("creates parts around a main space of the selection (spec 4.8)", () => {
    const form = { ...initialTarget(parts), mode: "CREATE" as const };
    expect(targetProblems(form, parts)).toEqual({ canonical: "required" });
    expect(targetProblems({ ...form, canonicalSpaceId: "S3" }, parts)).toEqual({ canonical: "required" });
    expect(targetProblems({ ...form, canonicalSpaceId: "S2" }, parts)).toEqual({});
    expect(targetBody({ ...form, canonicalSpaceId: "S2" }, parts)).toEqual({ mode: "CREATE", canonicalSpaceId: "S2", expectedVersion: 7 });
  });

  it("links only to a picked property, with every part mapped", () => {
    const form = { ...initialTarget(parts), mode: "LINK" as const };
    expect(targetProblems(form, parts)).toEqual({ property: "required" });
    const picked = pickProperty(form, found);
    expect(picked).toMatchObject({ propertyId: "P1", propertyCode: "SV-1", units: found.units, mappings: {} });
    expect(targetProblems(picked, parts)).toEqual({ mappings: "required" });
    expect(targetProblems({ ...picked, mappings: { S1: "U1" } }, parts)).toEqual({ mappings: "required" });
  });

  it("maps one to one", () => {
    const picked = { ...pickProperty({ ...initialTarget(parts), mode: "LINK" as const }, found), mappings: { S1: "U1", S2: "U1" } };
    expect(targetProblems(picked, parts)).toEqual({ mappings: "overlap" });
  });

  it("sends the link with its mappings in the order of the selection, and no canonical space", () => {
    const picked = {
      ...pickProperty({ ...initialTarget(parts), mode: "LINK" as const, canonicalSpaceId: "S1" }, found),
      mappings: { S2: "U2", S1: "U1" },
    };
    expect(targetBody(picked, parts)).toEqual({
      mode: "LINK",
      propertyId: "P1",
      mappings: [
        { spaceId: "S1", unitId: "U1" },
        { spaceId: "S2", unitId: "U2" },
      ],
      expectedVersion: 7,
    });
  });

  it("a new pick forgets the mappings of the last one", () => {
    const picked = { ...pickProperty({ ...initialTarget(parts), mode: "LINK" as const }, found), mappings: { S1: "U1" } };
    expect(pickProperty(picked, { propertyId: "P2", units: [] }).mappings).toEqual({});
  });
});

describe("searchQuery", () => {
  it("a code wins over everything else", () => {
    expect(searchQuery({ propertyCode: " SV-1 ", q: "x", page: 3 }, "W1")).toEqual({ propertyCode: "SV-1" });
  });

  it("text searches every property of the owner, so an older one with no ward code is found (spec 4.7)", () => {
    expect(searchQuery({ propertyCode: "", q: " Lê Lợi ", page: 1 }, "W1")).toEqual({ q: "Lê Lợi", page: 1 });
  });

  it("nothing typed lists the lead's ward", () => {
    expect(searchQuery({ propertyCode: "", q: "", page: 0 }, "W1")).toEqual({ wardCode: "W1", page: 0 });
  });

  it("gives null with nothing to search by", () => {
    expect(searchQuery({ propertyCode: " ", q: " ", page: 0 }, null)).toBeNull();
  });
});

describe("searchProblem", () => {
  it("keeps a phone number out of the query string: it would reach a URL before the server refuses it", () => {
    expect(searchProblem({ propertyCode: "", q: "Call 0901234567" })).toBe("phone");
  });

  it("keeps a phone number typed as a code out of the query string too", () => {
    expect(searchProblem({ propertyCode: "0901234567", q: "" })).toBe("phone");
  });

  it("keeps the text within its limit", () => {
    expect(searchProblem({ propertyCode: "", q: "a".repeat(101) })).toBe("tooLong");
  });

  it("has nothing to say about empty text, or a code that wins over it", () => {
    expect(searchProblem({ propertyCode: "", q: " " })).toBeNull();
    expect(searchProblem({ propertyCode: "SV-1", q: "a text the code wins over" })).toBeNull();
    expect(searchProblem({ propertyCode: "", q: "Lê Lợi" })).toBeNull();
  });
});
