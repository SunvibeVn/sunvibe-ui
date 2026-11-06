import { describe, expect, it } from "vitest";

import { termValueText } from "./term-text";

describe("termValueText", () => {
  it("reads money with its currency and unit", () => {
    expect(termValueText({ amount: 12000000, currency: "VND", unit: "MONTH" })).toBe("12,000,000 VND / Month");
    expect(termValueText({ amount: 500000, currency: "VND" })).toBe("500,000 VND");
  });

  it("reads a text as written, and a code as words", () => {
    expect(termValueText({ text: "Two months" })).toBe("Two months");
    expect(termValueText({ text: "PER_PERSON" })).toBe("Per person");
  });

  it("gives null for no value", () => {
    expect(termValueText(null)).toBeNull();
    expect(termValueText({})).toBeNull();
  });
});
