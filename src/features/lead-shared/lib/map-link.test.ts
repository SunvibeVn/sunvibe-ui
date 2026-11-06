import { describe, expect, it } from "vitest";

import { mapDirectionsUrl } from "./map-link";

describe("mapDirectionsUrl", () => {
  it("builds the Google Maps directions URL (W11-30)", () => {
    expect(mapDirectionsUrl(16.06, 108.22)).toBe("https://www.google.com/maps/dir/?api=1&destination=16.06,108.22");
  });

  it("accepts strings and negative values", () => {
    expect(mapDirectionsUrl("16.0678", "108.2208")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=16.0678,108.2208",
    );
    expect(mapDirectionsUrl(-16.5, -108.25)).toBe("https://www.google.com/maps/dir/?api=1&destination=-16.5,-108.25");
  });

  it("never lets a value add query parameters", () => {
    expect(mapDirectionsUrl("1&x=2", "3#4")).toBe("https://www.google.com/maps/dir/?api=1&destination=1%26x%3D2,3%234");
  });
});
