import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementFeePolicy } from "../types";

import {
  addTier,
  checkFeePolicy,
  EMPTY_FEE_POLICY,
  type FeePolicyValues,
  feePolicyBody,
  feePolicyProblemKey,
  feePolicyValuesOf,
  removeTier,
  setEarlyLeaseEndKind,
  setFormulaKind,
  setFormulaValue,
  setTier,
} from "./fee-policy-form";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });
const f = en.BrokerageAgreement.edit.feePolicy;

/** The values of spec section 4's example, as the Sale types them. */
const FULL: FeePolicyValues = {
  formula: {
    kind: "PERCENT_OF_RENT",
    tiers: [
      { fromMonths: "1", percent: "50" },
      { fromMonths: "12", percent: "100" },
    ],
    amount: "",
    freeReason: "",
  },
  dueDays: "7",
  renewal: { kind: "NOT_CHARGED", tiers: [], amount: "", freeReason: "" },
  earlyLeaseEnd: { kind: "PARTIAL_REFUND", refundPercent: "50", withinMonths: "3" },
  protectionDays: "90",
};

/** The text of each field in error. */
const texts = (values: FeePolicyValues) =>
  Object.fromEntries(
    Object.entries(checkFeePolicy(values)).map(([field, problem]) => [
      field,
      problem === undefined ? undefined : t(feePolicyProblemKey(problem)),
    ]),
  );

describe("the fee section's values, checks and request part (brokerage-agreement E05-S4, BR-7, S4-D3, S4-D14)", () => {
  it("feePolicyForm_clientChecks_refusedWithoutRequest: each value the server would refuse shows its text", () => {
    expect(checkFeePolicy(FULL)).toEqual({});
    expect(checkFeePolicy(EMPTY_FEE_POLICY)).toEqual({});

    const percents = setTier(setTier(FULL, "formula", 0, { percent: "0" }), "formula", 1, { percent: "301" });
    expect(texts(percents)).toEqual({
      "formula.tiers.0.percent": f.errors.percent,
      "formula.tiers.1.percent": f.errors.percent,
    });

    const starts = setTier(addTier(FULL, "formula"), "formula", 2, { fromMonths: "12", percent: "120" });
    expect(texts(starts)).toEqual({ "formula.tiers.2.fromMonths": f.errors.tierOrder });
    expect(texts(setTier(FULL, "formula", 1, { fromMonths: "121" }))).toEqual({
      "formula.tiers.1.fromMonths": f.errors.tierStart,
    });

    const fixed = setFormulaValue(setFormulaKind(FULL, "formula", "FIXED_AMOUNT"), "formula", "amount", "0");
    expect(texts(fixed)).toEqual({ "formula.amount": f.errors.fixedAmount });
    const renewalFixed = setFormulaKind(FULL, "renewal", "FIXED_AMOUNT");
    expect(texts(renewalFixed)).toEqual({ "renewal.amount": f.errors.fixedAmount });

    const free = setFormulaKind(FULL, "formula", "FREE");
    expect(texts(setFormulaValue(free, "formula", "freeReason", "   "))).toEqual({ "formula.freeReason": f.errors.freeReason });
    expect(texts(setFormulaValue(free, "formula", "freeReason", "x".repeat(501)))).toEqual({
      "formula.freeReason": f.errors.freeReason,
    });
    for (const hidden of ["\u0000", "\u007f", "\u0085", "‮", "⁦", "‎", "\t"]) {
      expect(texts(setFormulaValue(free, "formula", "freeReason", `First${hidden}unit`))).toEqual({
        "formula.freeReason": f.errors.freeReasonCharacters,
      });
    }
    expect(checkFeePolicy(setFormulaValue(free, "formula", "freeReason", "x".repeat(500)))).toEqual({});

    expect(texts({ ...FULL, dueDays: "31", protectionDays: "181" })).toEqual({
      dueDays: f.errors.dueDays,
      protectionDays: f.errors.protectionDays,
    });
    for (const [refundPercent, withinMonths] of [
      ["0", "0"],
      ["101", "13"],
    ]) {
      expect(texts({ ...FULL, earlyLeaseEnd: { kind: "PARTIAL_REFUND", refundPercent, withinMonths } })).toEqual({
        "earlyLeaseEnd.refundPercent": f.errors.refundPercent,
        "earlyLeaseEnd.withinMonths": f.errors.withinMonths,
      });
    }

    // Every text of the section differs from the E05-S3 texts the existing tests find by exact match (U-26).
    const earlier = Object.values(en.BrokerageAgreement.edit.errors);
    for (const text of Object.values(f.errors)) expect(earlier).not.toContain(text);
  });

  it("feePolicyForm_tiers_firstFixedAtOneAndAtMostFive: the first tier starts at 1 and stays; Add a tier stops at five", () => {
    let values = setFormulaKind(EMPTY_FEE_POLICY, "formula", "PERCENT_OF_RENT");
    expect(values.formula.tiers).toEqual([{ fromMonths: "1", percent: "" }]);

    values = setTier(values, "formula", 0, { fromMonths: "3", percent: "50" });
    expect(values.formula.tiers[0]).toEqual({ fromMonths: "1", percent: "50" });

    for (let count = 0; count < 6; count += 1) values = addTier(values, "formula");
    expect(values.formula.tiers).toHaveLength(5);

    expect(removeTier(values, "formula", 0).formula.tiers).toHaveLength(5);
    const fewer = removeTier(values, "formula", 2);
    expect(fewer.formula.tiers).toHaveLength(4);
    expect(fewer.formula.tiers[0]).toEqual({ fromMonths: "1", percent: "50" });

    const renewal = addTier(setFormulaKind(values, "renewal", "PERCENT_OF_RENT"), "renewal");
    expect(renewal.renewal.tiers).toEqual([
      { fromMonths: "1", percent: "" },
      { fromMonths: "", percent: "" },
    ]);
    expect(renewal.formula.tiers).toHaveLength(5);
  });

  it("feePolicyForm_switchKind_keepsOnlyItsFields: switching how the fee is set drops the other kind's values, and the first tier is back at 1", () => {
    let values = setFormulaKind(EMPTY_FEE_POLICY, "formula", "PERCENT_OF_RENT");
    values = setTier(values, "formula", 0, { percent: "50" });
    values = setTier(addTier(values, "formula"), "formula", 1, { fromMonths: "6", percent: "75" });
    values = setTier(addTier(values, "formula"), "formula", 2, { fromMonths: "12", percent: "100" });

    values = setFormulaValue(setFormulaKind(values, "formula", "FIXED_AMOUNT"), "formula", "amount", "2000000");
    expect(values.formula).toEqual({ kind: "FIXED_AMOUNT", tiers: [], amount: "2000000", freeReason: "" });
    expect(feePolicyBody(values).formula).toEqual({
      type: "FIXED_AMOUNT",
      tiers: null,
      amount: 2000000,
      currency: "VND",
      freeReason: null,
    });

    values = setTier(setFormulaKind(values, "formula", "PERCENT_OF_RENT"), "formula", 0, { percent: "40" });
    expect(values.formula).toEqual({
      kind: "PERCENT_OF_RENT",
      tiers: [{ fromMonths: "1", percent: "40" }],
      amount: "",
      freeReason: "",
    });
    expect(feePolicyBody(values).formula).toEqual({
      type: "PERCENT_OF_RENT",
      tiers: [{ fromMonths: 1, percent: 40 }],
      amount: null,
      currency: null,
      freeReason: null,
    });

    // The same kind again keeps what is typed; another early-end kind drops the refund's values.
    expect(setFormulaKind(values, "formula", "PERCENT_OF_RENT")).toBe(values);
    const refund = { ...values, earlyLeaseEnd: { kind: "PARTIAL_REFUND" as const, refundPercent: "50", withinMonths: "3" } };
    expect(setEarlyLeaseEndKind(refund, "NO_REFUND").earlyLeaseEnd).toEqual({
      kind: "NO_REFUND",
      refundPercent: "",
      withinMonths: "",
    });
    expect(feePolicyBody(setEarlyLeaseEndKind(refund, "NO_REFUND")).earlyLeaseEnd).toEqual({
      type: "NO_REFUND",
      refundPercent: null,
      withinMonths: null,
    });
    expect(setFormulaKind(values, "formula", "").formula).toEqual({ kind: "", tiers: [], amount: "", freeReason: "" });
  });

  it("feePolicyForm_emptyPolicy_everyPartNull: a section with nothing entered sends an object with each part null", () => {
    expect(feePolicyBody(EMPTY_FEE_POLICY)).toStrictEqual({
      formula: null,
      dueDays: null,
      renewal: null,
      earlyLeaseEnd: null,
      protectionDays: null,
    });
    expect(feePolicyValuesOf(undefined)).toEqual(EMPTY_FEE_POLICY);
    expect(feePolicyValuesOf(null)).toEqual(EMPTY_FEE_POLICY);
    expect(
      feePolicyValuesOf({
        payer: "OWNER",
        chargedWhen: "LEASE_SIGNED",
        formula: null,
        dueDays: null,
        renewal: null,
        earlyLeaseEnd: null,
        protectionDays: null,
      }),
    ).toEqual(EMPTY_FEE_POLICY);
  });

  it("feePolicyForm_fullValues_requestPartAsSection4: the values of section 4's example send its request part, and an answer reads back as its values", () => {
    const body = feePolicyBody(FULL);

    expect(JSON.stringify(body)).toBe(
      '{"formula":{"type":"PERCENT_OF_RENT","tiers":[{"fromMonths":1,"percent":50},{"fromMonths":12,"percent":100}],"amount":null,"currency":null,"freeReason":null},"dueDays":7,"renewal":{"type":"NOT_CHARGED","tiers":null,"amount":null,"currency":null,"freeReason":null},"earlyLeaseEnd":{"type":"PARTIAL_REFUND","refundPercent":50,"withinMonths":3},"protectionDays":90}',
    );

    const answer: BrokerageAgreementFeePolicy = {
      payer: "OWNER",
      chargedWhen: "LEASE_SIGNED",
      formula: {
        type: "PERCENT_OF_RENT",
        tiers: [
          { fromMonths: 1, percent: 50 },
          { fromMonths: 12, percent: 100 },
        ],
        amount: null,
        currency: null,
        freeReason: null,
      },
      dueDays: 7,
      renewal: { type: "NOT_CHARGED", tiers: [], amount: null, currency: null, freeReason: null },
      earlyLeaseEnd: { type: "PARTIAL_REFUND", refundPercent: 50, withinMonths: 3 },
      protectionDays: 90,
    };
    expect(feePolicyValuesOf(answer)).toEqual(FULL);

    const other = feePolicyValuesOf({
      ...answer,
      formula: { type: "FREE", tiers: [], amount: null, currency: null, freeReason: "First unit with Sunvibe" },
      renewal: { type: "FIXED_AMOUNT", tiers: [], amount: 999999999999999, currency: "VND", freeReason: null },
      earlyLeaseEnd: { type: "NO_REFUND", refundPercent: null, withinMonths: null },
      dueDays: 0,
      protectionDays: 0,
    });
    expect(feePolicyBody({ ...other, formula: { ...other.formula, freeReason: "  First unit with Sunvibe  " } })).toEqual({
      formula: { type: "FREE", tiers: null, amount: null, currency: null, freeReason: "First unit with Sunvibe" },
      dueDays: 0,
      renewal: { type: "FIXED_AMOUNT", tiers: null, amount: 999999999999999, currency: "VND", freeReason: null },
      earlyLeaseEnd: { type: "NO_REFUND", refundPercent: null, withinMonths: null },
      protectionDays: 0,
    });
    expect(JSON.stringify(feePolicyBody(other))).not.toMatch(/e\+|999999999999999\.|1000000000000000/);

    // A type the form cannot hold in its place reads as not entered.
    expect(feePolicyValuesOf({ ...answer, formula: { ...answer.formula, type: "NOT_CHARGED" } }).formula.kind).toBe("");
    expect(feePolicyValuesOf({ ...answer, renewal: { ...answer.renewal, type: "FREE" } }).renewal.kind).toBe("");
  });

  it("feePolicyForm_reasonWithEmoji_countsUtf16Units: the reason's 500 are UTF-16 units, as the server counts them", () => {
    const free = setFormulaKind(EMPTY_FEE_POLICY, "formula", "FREE");
    const emoji = "\u{1F600}";
    expect(emoji.length).toBe(2);

    expect(checkFeePolicy(setFormulaValue(free, "formula", "freeReason", `${"a".repeat(498)}${emoji}`))).toEqual({});
    expect(checkFeePolicy(setFormulaValue(free, "formula", "freeReason", `${"a".repeat(499)}${emoji}`))).toEqual({
      "formula.freeReason": "freeReason",
    });
    // The raw text holds the contract's 500 too (E05S4-P3): spaces around do not make room.
    expect(checkFeePolicy(setFormulaValue(free, "formula", "freeReason", ` ${"a".repeat(500)}`))).toEqual({
      "formula.freeReason": "freeReason",
    });
  });
});
