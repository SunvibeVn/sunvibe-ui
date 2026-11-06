import { describe, expect, it } from "vitest";

import { codeText } from "./code-text";

describe("codeText", () => {
  it("reads an enum value as words", () => {
    expect(codeText("AIR_CONDITIONER")).toBe("Air conditioner");
    expect(codeText("UNDER_RENOVATION")).toBe("Under renovation");
    expect(codeText("ON_SITE")).toBe("On site");
    expect(codeText("MONTH")).toBe("Month");
  });

  it("reads a field name as words", () => {
    expect(codeText("monthlyRent")).toBe("Monthly rent");
    expect(codeText("paymentPeriodMonths")).toBe("Payment period months");
    expect(codeText("area")).toBe("Area");
  });

  it("keeps the free name of a fee, and the part a term belongs to", () => {
    expect(codeText("spaceFees:Phí vệ sinh")).toBe("Phí vệ sinh");
    expect(codeText("P101.monthlyRent")).toBe("P101 · Monthly rent");
  });

  it("leaves a two-letter name in capitals as written: an owner's TV is not a code", () => {
    expect(codeText("TV")).toBe("TV");
    expect(codeText("AC")).toBe("AC");
    expect(codeText("BED")).toBe("Bed");
  });

  it("leaves a number as written: a term value is read before completing", () => {
    expect(codeText("3.5")).toBe("3.5");
    expect(codeText("12.5 triệu")).toBe("12.5 triệu");
  });

  it("reads any space code with its term", () => {
    expect(codeText("12.05.monthlyRent")).toBe("12.05 · Monthly rent");
    expect(codeText("Phòng 1.deposit")).toBe("Phòng 1 · Deposit");
    expect(codeText("101.monthlyRent")).toBe("101 · Monthly rent");
    expect(codeText("P101.spaceFees:Phí vệ sinh")).toBe("P101 · Phí vệ sinh");
  });

  it("leaves free text as written", () => {
    expect(codeText("Máy lạnh mới")).toBe("Máy lạnh mới");
    expect(codeText("Two months, paid ahead")).toBe("Two months, paid ahead");
    expect(codeText("Wifi 6")).toBe("Wifi 6");
    expect(codeText("gas: yes")).toBe("gas: yes");
  });
});
