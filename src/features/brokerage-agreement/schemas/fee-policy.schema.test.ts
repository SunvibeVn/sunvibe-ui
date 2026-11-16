import { describe, expect, it } from "vitest";

import { feePolicySchema } from "./fee-policy.schema";

const EMPTY = { kind: "", tiers: [], amount: "", freeReason: "" } as const;
const NONE = { kind: "", refundPercent: "", withinMonths: "" } as const;

/** The values of the section with every part not entered, then `patch`. */
const values = (patch: Record<string, unknown> = {}) => ({
  formula: EMPTY,
  dueDays: "",
  renewal: EMPTY,
  earlyLeaseEnd: NONE,
  protectionDays: "",
  ...patch,
});
const percent = (tiers: [string, string][]) => ({
  ...EMPTY,
  kind: "PERCENT_OF_RENT",
  tiers: tiers.map(([fromMonths, share]) => ({ fromMonths, percent: share })),
});
const fixed = (amount: string) => ({ ...EMPTY, kind: "FIXED_AMOUNT", amount });
const refund = (refundPercent: string, withinMonths: string) => ({ kind: "PARTIAL_REFUND", refundPercent, withinMonths });
const accepted = (patch: Record<string, unknown>) => feePolicySchema.safeParse(values(patch)).success;

describe("feePolicySchema (brokerage-agreement E05-S4, BR-7, S4-D3)", () => {
  it("feePolicySchema_bounds_asTheServer: each bound of the fee policy accepts its edge and refuses one beyond", () => {
    expect(accepted({})).toBe(true);

    expect(accepted({ formula: percent([["1", "1"]]) })).toBe(true);
    expect(accepted({ formula: percent([["1", "300"]]) })).toBe(true);
    expect(accepted({ formula: percent([["1", "0"]]) })).toBe(false);
    expect(accepted({ formula: percent([["1", "301"]]) })).toBe(false);
    expect(accepted({ formula: percent([["1", "50"], ["120", "100"]]) })).toBe(true);
    expect(accepted({ formula: percent([["1", "50"], ["121", "100"]]) })).toBe(false);
    expect(accepted({ renewal: percent([["1", "300"], ["120", "1"]]) })).toBe(true);
    expect(accepted({ renewal: percent([["1", "301"]]) })).toBe(false);

    expect(accepted({ formula: fixed("1") })).toBe(true);
    expect(accepted({ formula: fixed("999999999999999") })).toBe(true);
    expect(accepted({ formula: fixed("0") })).toBe(false);
    expect(accepted({ formula: fixed("1000000000000000") })).toBe(false);
    expect(accepted({ renewal: fixed("1") })).toBe(true);
    expect(accepted({ renewal: fixed("0") })).toBe(false);

    for (const [part, low, high, below, above] of [
      ["dueDays", "0", "30", "-1", "31"],
      ["protectionDays", "0", "180", "-1", "181"],
    ] as const) {
      expect(accepted({ [part]: low })).toBe(true);
      expect(accepted({ [part]: high })).toBe(true);
      expect(accepted({ [part]: below })).toBe(false);
      expect(accepted({ [part]: above })).toBe(false);
    }

    expect(accepted({ earlyLeaseEnd: refund("1", "1") })).toBe(true);
    expect(accepted({ earlyLeaseEnd: refund("100", "12") })).toBe(true);
    expect(accepted({ earlyLeaseEnd: refund("0", "3") })).toBe(false);
    expect(accepted({ earlyLeaseEnd: refund("101", "3") })).toBe(false);
    expect(accepted({ earlyLeaseEnd: refund("50", "0") })).toBe(false);
    expect(accepted({ earlyLeaseEnd: refund("50", "13") })).toBe(false);
    expect(accepted({ earlyLeaseEnd: { kind: "NO_REFUND", refundPercent: "", withinMonths: "" } })).toBe(true);
  });

  it("feePolicySchema_tiers_firstAtOneRisingAtMostFive: the first tier starts at 1, each start is above the one before, at most five tiers", () => {
    const five: [string, string][] = [
      ["1", "50"],
      ["6", "60"],
      ["12", "70"],
      ["24", "80"],
      ["36", "90"],
    ];
    expect(accepted({ formula: percent(five) })).toBe(true);
    expect(accepted({ formula: percent([...five, ["48", "100"]]) })).toBe(false);
    expect(accepted({ formula: percent([["2", "50"]]) })).toBe(false);
    expect(accepted({ formula: percent([["1", "50"], ["12", "60"], ["12", "70"]]) })).toBe(false);
    expect(accepted({ formula: percent([["1", "50"], ["12", "60"], ["6", "70"]]) })).toBe(false);
    expect(accepted({ formula: percent([]) })).toBe(false);
    // The percentages are not ordered (S4-D3).
    expect(accepted({ formula: percent([["1", "100"], ["12", "50"]]) })).toBe(true);
  });

  it("feePolicySchema_numbers_digitsOnly: a number with a sign, a separator, a fraction or a space is refused", () => {
    for (const typed of ["+7", "7.0", "7,0", " 7", "1e1", "７"]) expect(accepted({ dueDays: typed })).toBe(false);
    for (const typed of ["2,000,000", "2000000.5", "-1"]) expect(accepted({ formula: fixed(typed) })).toBe(false);
  });
});
