import { describe, expect, it } from "vitest";

import {
  canChangeRequirement,
  offeredIntents,
  priceUnitOf,
  type RequirementForm,
  REQUIREMENT_DEFAULTS,
  toIntentBody,
  validateRequirement,
} from "./requirement-form";

/** 2026-10-25 10:20 in Vietnam. */
const NOW = Date.parse("2026-10-25T03:20:00Z");
const ctx = { current: "LONG_TERM_RENT", leadCreatedAt: "2026-10-20T01:00:00Z", now: NOW };

const form = (extra: Partial<RequirementForm> = {}): RequirementForm => ({
  ...REQUIREMENT_DEFAULTS,
  newIntent: "SHORT_TERM_RENT",
  amount: "800000",
  reason: "Owner wants short stays",
  basisDate: "2026-10-24",
  basisText: "Owner said so on the phone",
  ...extra,
});

describe("offeredIntents (US-5 AC-1, W15-34)", () => {
  it("offers the rental intents other than the current one, never sale", () => {
    expect(offeredIntents("LONG_TERM_RENT")).toEqual(["SHORT_TERM_RENT"]);
    expect(offeredIntents("SHORT_TERM_RENT")).toEqual(["LONG_TERM_RENT"]);
  });

  it("offers both rentals to a sale lead or one without an intent", () => {
    expect(offeredIntents("SALE")).toEqual(["SHORT_TERM_RENT", "LONG_TERM_RENT"]);
    expect(offeredIntents(undefined)).toEqual(["SHORT_TERM_RENT", "LONG_TERM_RENT"]);
  });
});

describe("priceUnitOf (US-5 AC-2)", () => {
  it("follows the chosen intent", () => {
    expect(priceUnitOf("SHORT_TERM_RENT")).toBe("NIGHT");
    expect(priceUnitOf("LONG_TERM_RENT")).toBe("MONTH");
    expect(priceUnitOf("")).toBeNull();
  });
});

describe("canChangeRequirement (spec 4.6)", () => {
  it("is open from Assigned, Contacted, On Hold and Survey Scheduled only", () => {
    for (const status of ["ASSIGNED", "CONTACTED", "ON_HOLD", "SURVEY_SCHEDULED"]) expect(canChangeRequirement(status)).toBe(true);
    for (const status of ["NEW", "DUPLICATE", "REJECTED", "WITHDRAWN", undefined]) expect(canChangeRequirement(status)).toBe(false);
  });
});

describe("toIntentBody (A-17)", () => {
  it("sends the price in the unit of the new intent", () => {
    expect(toIntentBody(form(), { leadVersion: 3 })).toEqual({
      expectedVersion: 3,
      newIntent: "SHORT_TERM_RENT",
      askingPrice: { amount: "800000", currency: "VND", unit: "NIGHT" },
      reason: "Owner wants short stays",
      basis: { confirmedOn: "2026-10-24", text: "Owner said so on the phone" },
    });
  });

  it("sends askingPrice: null for No price until confirmed", () => {
    expect(toIntentBody(form({ noPrice: true, amount: "123" }), { leadVersion: 3 }).askingPrice).toBeNull();
  });

  it("reads an amount typed with separators", () => {
    expect(toIntentBody(form({ newIntent: "LONG_TERM_RENT", amount: "12.000.000" }), { leadVersion: 3 }).askingPrice).toEqual({
      amount: "12000000",
      currency: "VND",
      unit: "MONTH",
    });
  });
});

describe("validateRequirement (US-5, BR-10, A-14, A-25)", () => {
  it("accepts a complete form", () => {
    expect(validateRequirement(form(), ctx)).toEqual({});
  });

  it("asks for an offered intent", () => {
    expect(validateRequirement(form({ newIntent: "" }), ctx).newIntent).toBe("required");
    expect(validateRequirement(form({ newIntent: "LONG_TERM_RENT" }), ctx).newIntent).toBe("invalid");
    expect(validateRequirement(form({ newIntent: "SALE" }), ctx).newIntent).toBe("invalid");
  });

  it("asks for a price or No price until confirmed", () => {
    expect(validateRequirement(form({ amount: "" }), ctx).amount).toBe("required");
    expect(validateRequirement(form({ amount: "", noPrice: true }), ctx).amount).toBeUndefined();
    expect(validateRequirement(form({ amount: "0" }), ctx).amount).toBe("invalid");
    expect(validateRequirement(form({ amount: "12a" }), ctx).amount).toBe("invalid");
    expect(validateRequirement(form({ amount: "1".repeat(16) }), ctx).amount).toBe("invalid");
  });

  it("dates the owner's agreement from the lead's creation day to today", () => {
    expect(validateRequirement(form({ basisDate: "2026-10-26" }), ctx).basisDate).toBe("tooLate");
    expect(validateRequirement(form({ basisDate: "2026-10-19" }), ctx).basisDate).toBe("tooEarly");
    expect(validateRequirement(form({ basisDate: "2026-10-20" }), ctx).basisDate).toBeUndefined();
  });

  it("asks for reason and basis text without a phone number", () => {
    expect(validateRequirement(form({ reason: "" }), ctx).reason).toBe("required");
    expect(validateRequirement(form({ reason: "Call 0905 123 456" }), ctx).reason).toBe("phone");
    expect(validateRequirement(form({ basisText: "a".repeat(501) }), ctx).basisText).toBe("tooLong");
  });
});
