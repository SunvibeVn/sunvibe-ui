import { describe, expect, it } from "vitest";

import vi from "@/i18n/messages/vi.json";

import { formatDate, formatDateTime, formatPrice, instantToLocalInput, localInputToInstant } from "./format";
import type { OwnerLeadsKey } from "./labels";

/** Stands in for `useTranslations("OwnerLeads")`: reads the key from vi.json. */
const t = (key: OwnerLeadsKey): string =>
  key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], vi.OwnerLeads) as string;

const VND = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

describe("formatDateTime (BR-5, W11-44)", () => {
  it("shows dd/MM/yyyy HH:mm in Vietnam time", () => {
    expect(formatDateTime("2026-10-18T02:05:00Z")).toBe("18/10/2026 09:05");
  });

  it("rolls over to the next day at 17:00 UTC", () => {
    expect(formatDateTime("2026-12-31T17:30:00Z")).toBe("01/01/2027 00:30");
  });

  it("reads an offset instant", () => {
    expect(formatDateTime("2026-10-18T09:05:00+07:00")).toBe("18/10/2026 09:05");
  });

  it("does not depend on the machine time zone", () => {
    const saved = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      expect(formatDateTime("2026-10-18T02:05:00Z")).toBe("18/10/2026 09:05");
      process.env.TZ = "Pacific/Auckland";
      expect(formatDateTime("2026-10-18T02:05:00Z")).toBe("18/10/2026 09:05");
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });

  it("returns an empty string for an unreadable value", () => {
    expect(formatDateTime("nope")).toBe("");
  });
});

describe("formatDate", () => {
  it("shows a date-only value as dd/MM/yyyy without shifting it", () => {
    expect(formatDate("2026-10-18")).toBe("18/10/2026");
    expect(formatDate("2026-01-05")).toBe("05/01/2026");
  });

  it("returns an empty string for an unreadable value", () => {
    expect(formatDate("18/10/2026")).toBe("");
  });

  it("takes a date only: a date-time or trailing text is unreadable, not cut", () => {
    expect(formatDate("2026-10-18T09:05:00Z")).toBe("");
    expect(formatDate("2026-10-18 junk")).toBe("");
  });
});

describe("formatPrice (BR-5)", () => {
  it("shows the amount alone for a unit it does not know, never a raw code", () => {
    expect(formatPrice({ amount: 800000, unit: "WEEK" }, t)).toBe(VND.format(800000));
    expect(formatPrice({ amount: 800000, unit: "toString" }, t)).toBe(VND.format(800000));
  });

  it("formats monthly rent", () => {
    expect(formatPrice({ amount: 3500000, unit: "MONTH" }, t)).toBe(`${VND.format(3500000)}/tháng`);
    expect(formatPrice({ amount: 3500000, unit: "MONTH" }, t)).toContain("3.500.000");
    expect(formatPrice({ amount: 3500000, unit: "MONTH" }, t)).toContain("₫/tháng");
  });

  it("formats a nightly price", () => {
    expect(formatPrice({ amount: 800000, unit: "NIGHT" }, t)).toBe(`${VND.format(800000)}/đêm`);
  });

  it("formats a sale price", () => {
    expect(formatPrice({ amount: 2500000000, unit: "TOTAL" }, t)).toBe(`${VND.format(2500000000)} (giá bán)`);
  });

  it("accepts the amount as a string (int64)", () => {
    expect(formatPrice({ amount: "15000000", unit: "MONTH" }, t)).toBe(`${VND.format(15000000)}/tháng`);
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

describe("datetime-local conversion (W11-44)", () => {
  it("reads a local value as Vietnam time", () => {
    expect(localInputToInstant("2026-10-18T09:05")).toBe("2026-10-18T02:05:00.000Z");
  });

  it("crosses midnight", () => {
    expect(localInputToInstant("2026-10-18T00:30")).toBe("2026-10-17T17:30:00.000Z");
  });

  it("accepts seconds", () => {
    expect(localInputToInstant("2026-10-18T09:05:30")).toBe("2026-10-18T02:05:30.000Z");
  });

  it("rejects a malformed or impossible value", () => {
    expect(() => localInputToInstant("")).toThrow(RangeError);
    expect(() => localInputToInstant("2026-10-18")).toThrow(RangeError);
    expect(() => localInputToInstant("2026-13-18T09:05")).toThrow(RangeError);
    expect(() => localInputToInstant("2026-02-30T09:05")).toThrow(RangeError);
  });

  it("writes an instant as a Vietnam-time input value", () => {
    expect(instantToLocalInput("2026-10-18T02:05:00.000Z")).toBe("2026-10-18T09:05");
    expect(instantToLocalInput("2026-10-17T17:30:00Z")).toBe("2026-10-18T00:30");
  });

  it("round-trips", () => {
    expect(instantToLocalInput(localInputToInstant("2027-03-04T23:59"))).toBe("2027-03-04T23:59");
  });

  it("returns an empty string for an unreadable instant", () => {
    expect(instantToLocalInput("nope")).toBe("");
  });
});
