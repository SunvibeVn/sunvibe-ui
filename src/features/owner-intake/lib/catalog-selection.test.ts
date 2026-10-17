import { describe, expect, it } from "vitest";

import type { Ward } from "../types/catalog";

import { changeProvince, changeWard, defaultProvinceCode, reconcileWard } from "./catalog-selection";

const wards: Ward[] = [
  { code: "20275", name: "An Hải", type: "WARD" },
  { code: "20308", name: "Bà Nà", type: "COMMUNE" },
  { code: "20333", name: "Hoàng Sa", type: "SPECIAL_ZONE" },
];

describe("defaultProvinceCode", () => {
  it("picks the single province when none is selected", () => {
    expect(defaultProvinceCode("", [{ code: "48", name: "Đà Nẵng" }])).toBe("48");
  });

  it("keeps the choice open when there are several provinces or one is already selected", () => {
    const two = [
      { code: "48", name: "Đà Nẵng" },
      { code: "01", name: "Hà Nội" },
    ];
    expect(defaultProvinceCode("", two)).toBeUndefined();
    expect(defaultProvinceCode("01", [{ code: "48", name: "Đà Nẵng" }])).toBeUndefined();
  });
});

describe("changeProvince", () => {
  it("clears the ward and the pin when a ward was chosen", () => {
    expect(changeProvince({ provinceCode: "48", wardCode: "20275" }, "01")).toEqual({
      provinceCode: "01",
      wardCode: "",
      wardType: undefined,
      clearPin: true,
    });
  });

  it("does not ask to clear the pin when no ward was chosen", () => {
    expect(changeProvince({ provinceCode: "", wardCode: "" }, "48")).toEqual({
      provinceCode: "48",
      wardCode: "",
      wardType: undefined,
      clearPin: false,
    });
  });

  it("returns null when the province does not change", () => {
    expect(changeProvince({ provinceCode: "48", wardCode: "20275" }, "48")).toBeNull();
  });
});

describe("changeWard", () => {
  it("reports the ward type and name", () => {
    expect(changeWard("48", wards, "20308")).toEqual({
      provinceCode: "48",
      wardCode: "20308",
      wardType: "COMMUNE",
      wardName: "Bà Nà",
      clearPin: false,
    });
  });

  it("asks to clear the pin for a special zone", () => {
    expect(changeWard("48", wards, "20333")).toMatchObject({
      wardType: "SPECIAL_ZONE",
      wardName: "Hoàng Sa",
      clearPin: true,
    });
  });

  it("treats an unknown code as no ward", () => {
    expect(changeWard("48", wards, "")).toEqual({
      provinceCode: "48",
      wardCode: "",
      wardType: undefined,
      clearPin: false,
    });
  });
});

describe("reconcileWard", () => {
  it("returns null when the ward is still in the list", () => {
    expect(reconcileWard({ provinceCode: "48", wardCode: "20275" }, wards)).toBeNull();
  });

  it("returns null when no ward is chosen", () => {
    expect(reconcileWard({ provinceCode: "48", wardCode: "" }, wards)).toBeNull();
  });

  it("clears the ward and the pin when the new list makes the current ward invalid", () => {
    expect(reconcileWard({ provinceCode: "48", wardCode: "99999" }, wards)).toEqual({
      provinceCode: "48",
      wardCode: "",
      wardType: undefined,
      clearPin: true,
    });
  });
});
