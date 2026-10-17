import { describe, expect, it } from "vitest";

import { isInsideServiceBox, placePin, roundCoordinate, SERVICE_BOX } from "./geo";

describe("roundCoordinate", () => {
  it.each([
    [16.067812345678901, 16.067812],
    [108.22084567891234, 108.220846],
    [15.850000499999999, 15.85],
    [16.0678, 16.0678],
  ])("rounds %d to 6 decimals", (input, expected) => {
    expect(roundCoordinate(input)).toBe(expected);
  });
});

describe("isInsideServiceBox", () => {
  it("uses the server box of handoff 2.5", () => {
    expect(SERVICE_BOX).toEqual({ minLatitude: 15.85, maxLatitude: 16.25, minLongitude: 107.75, maxLongitude: 108.4 });
  });

  it("accepts the spec example 16.0678 / 108.2208", () => {
    expect(isInsideServiceBox(16.0678, 108.2208)).toBe(true);
  });

  it.each([
    [15.85, 107.75],
    [15.85, 108.4],
    [16.25, 107.75],
    [16.25, 108.4],
  ])("accepts the corner %d / %d (edges inclusive)", (lat, lon) => {
    expect(isInsideServiceBox(lat, lon)).toBe(true);
  });

  it.each([
    [15.849999, 108.2],
    [16.250001, 108.2],
    [16.05, 107.749999],
    [16.05, 108.400001],
  ])("refuses %d / %d just outside the box", (lat, lon) => {
    expect(isInsideServiceBox(lat, lon)).toBe(false);
  });

  it("checks after rounding, like the server", () => {
    expect(isInsideServiceBox(16.2500004, 108.4000004)).toBe(true);
    expect(isInsideServiceBox(16.2500006, 108.2)).toBe(false);
  });
});

describe("placePin", () => {
  it("returns the rounded pin inside the box", () => {
    expect(placePin(16.067812345678901, 108.22084567891234)).toEqual({ latitude: 16.067812, longitude: 108.220846 });
  });

  it("returns undefined outside the box", () => {
    expect(placePin(21.0285, 105.8542)).toBeUndefined();
  });
});
