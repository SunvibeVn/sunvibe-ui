import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { formatPrice } from "./format";
import type { OwnerLeadsKey } from "./labels";

/** Stands in for `useTranslations("OwnerLeads")`: reads the key from en.json. */
const t = (key: OwnerLeadsKey): string =>
  key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en.OwnerLeads) as string;

const VND = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

describe("formatPrice (BR-5)", () => {
  it("shows the amount alone for a unit it does not know, never a raw code", () => {
    expect(formatPrice({ amount: 800000, unit: "WEEK" }, t)).toBe(VND.format(800000));
    expect(formatPrice({ amount: 800000, unit: "toString" }, t)).toBe(VND.format(800000));
  });

  it("formats monthly rent", () => {
    expect(formatPrice({ amount: 3500000, unit: "MONTH" }, t)).toBe(`${VND.format(3500000)}/month`);
    expect(formatPrice({ amount: 3500000, unit: "MONTH" }, t)).toContain("3.500.000");
    expect(formatPrice({ amount: 3500000, unit: "MONTH" }, t)).toContain("₫/month");
  });

  it("formats a nightly price", () => {
    expect(formatPrice({ amount: 800000, unit: "NIGHT" }, t)).toBe(`${VND.format(800000)}/night`);
  });

  it("formats a sale price", () => {
    expect(formatPrice({ amount: 2500000000, unit: "TOTAL" }, t)).toBe(`${VND.format(2500000000)} (sale price)`);
  });

  it("accepts the amount as a string (int64)", () => {
    expect(formatPrice({ amount: "15000000", unit: "MONTH" }, t)).toBe(`${VND.format(15000000)}/month`);
  });

  it("asks for the unit label by its PRICE_UNIT_LABEL key", () => {
    const asked: string[] = [];
    expect(formatPrice({ amount: 1, unit: "NIGHT" }, (key) => (asked.push(key), "<unit>"))).toBe(`${VND.format(1)}<unit>`);
    expect(asked).toEqual(["priceUnit.NIGHT"]);
  });

  it("keeps a 15-digit amount exact", () => {
    expect(formatPrice({ amount: "999999999999999", unit: "TOTAL" }, t)).toContain("999.999.999.999.999");
  });
});
