import { describe, expect, it } from "vitest";

import type { IntakeBlock } from "../types";

import { initialSelection, selectedSpaces, selectionBody, selectionChanged, selectionProblem, spaceLabel, toggleSpace } from "./selection-form";

const whole: IntakeBlock = { source: { rentalScope: "WHOLE", spaces: [{ spaceId: "S1" }] } };
const parts: IntakeBlock = { source: { rentalScope: "PARTS", spaces: [{ spaceId: "S1" }, { spaceId: "S2" }, { spaceId: "S3" }] } };

describe("the selection form", () => {
  it("starts from what the block holds", () => {
    expect(initialSelection({ ...parts, selection: { spaceIds: ["S2"] } })).toEqual(["S2"]);
  });

  it("a whole property starts with its one space, and parts with none", () => {
    expect(initialSelection(whole)).toEqual(["S1"]);
    expect(initialSelection(parts)).toEqual([]);
  });

  it("toggles a part on and off, in the order of the source", () => {
    expect(toggleSpace(["S3"], "S1", parts)).toEqual(["S1", "S3"]);
    expect(toggleSpace(["S1", "S3"], "S1", parts)).toEqual(["S3"]);
  });

  it("cannot pick a space outside the source (spec 4.5)", () => {
    expect(toggleSpace(["S1"], "OTHER", parts)).toEqual(["S1"]);
  });

  it("needs at least one part, and at most fifty", () => {
    expect(selectionProblem([])).toBe("required");
    expect(selectionProblem(["S1"])).toBeNull();
    expect(selectionProblem(Array.from({ length: 51 }, (_, index) => `S${index}`))).toBe("tooMany");
  });

  it("sends the block's version, null while no row exists", () => {
    expect(selectionBody(["S1"], { version: 4 })).toEqual({ spaceIds: ["S1"], expectedVersion: 4 });
    expect(selectionBody(["S1"], { version: null })).toEqual({ spaceIds: ["S1"], expectedVersion: null });
    expect(selectionBody(["S1"], {})).toEqual({ spaceIds: ["S1"], expectedVersion: null });
  });

  it("lists the selected spaces, in the order of the source", () => {
    expect(selectedSpaces({ ...parts, selection: { spaceIds: ["S3", "S1"] } }).map((space) => space.spaceId)).toEqual(["S1", "S3"]);
    expect(selectedSpaces(parts)).toEqual([]);
  });

  it("names a space by its code and location", () => {
    expect(spaceLabel({ code: "P101", location: "Floor 1" })).toBe("P101 · Floor 1");
    expect(spaceLabel({ code: "P101", location: null })).toBe("P101");
    expect(spaceLabel({})).toBe("");
  });
});

describe("a changed selection (property-create SV-202)", () => {
  const stored = { selection: { spaceIds: ["S1", "S2"] } };

  it("a first save always counts as a change", () => {
    expect(selectionChanged(["S1"], {})).toBe(true);
    expect(selectionChanged(["S1"], { selection: null })).toBe(true);
  });

  it("the stored parts in any order are no change", () => {
    expect(selectionChanged(["S2", "S1"], stored)).toBe(false);
    expect(selectionChanged(["S1", "S2"], stored)).toBe(false);
  });

  it("another set is a change", () => {
    expect(selectionChanged(["S1"], stored)).toBe(true);
    expect(selectionChanged(["S1", "S2", "S3"], stored)).toBe(true);
    expect(selectionChanged(["S1", "S3"], stored)).toBe(true);
    expect(selectionChanged([], stored)).toBe(true);
  });
});
