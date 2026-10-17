import { describe, expect, it } from "vitest";

import { applyCatalogChange, EMPTY_FORM_VALUES } from "./form-values";

describe("applyCatalogChange", () => {
  const pinned = { ...EMPTY_FORM_VALUES, provinceCode: "48", wardCode: "20275", wardType: "WARD" as const, latitude: 16, longitude: 108 };

  it("stores the selection, ward type and ward name and keeps the pin", () => {
    expect(
      applyCatalogChange(pinned, { provinceCode: "48", wardCode: "20308", wardType: "COMMUNE", wardName: "Bà Nà", clearPin: false }),
    ).toEqual({
      ...pinned,
      wardCode: "20308",
      wardType: "COMMUNE",
      wardName: "Bà Nà",
    });
  });

  it("clears the pin and the ward type when asked", () => {
    const next = applyCatalogChange(pinned, { provinceCode: "48", wardCode: "", clearPin: true });
    expect(next.wardCode).toBe("");
    expect(next.wardType).toBeUndefined();
    expect(next.wardName).toBeUndefined();
    expect(next.latitude).toBeUndefined();
    expect(next.longitude).toBeUndefined();
  });
});
