import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementFeePolicy } from "../types";

import { type FeePolicyView, feePolicyModel } from "./fee-policy-model";
import { type Phrase, phraseText } from "./version-terms-model";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });
const text = (phrase: Phrase | null) => (phrase === null ? null : phraseText(t, phrase));

/** The fee policy of spec section 4's example, as the detail answers it. */
const FULL: BrokerageAgreementFeePolicy = {
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

/** Every line of a view as its English text, in the panel's order. */
function lines(view: FeePolicyView) {
  return {
    payer: text(view.payer),
    chargedWhen: text(view.chargedWhen),
    formula: view.formula.map(text),
    dueDays: text(view.dueDays),
    renewal: view.renewal.map(text),
    earlyLeaseEnd: text(view.earlyLeaseEnd),
    protectionDays: text(view.protectionDays),
  };
}

describe("feePolicyModel (brokerage-agreement E05-S4, BR-7, S4-D10, S4-D14, spec section 6)", () => {
  it("feePolicyModel_everyPart_linesAsSection6: each part of a fee policy reads the texts of section 6", () => {
    expect(lines(feePolicyModel(FULL, false))).toEqual({
      payer: "The owner",
      chargedWhen: "When a lease is signed",
      formula: [
        "From a lease term of 1 month: 50% of one month's rent",
        "From a lease term of 12 months: 100% of one month's rent",
      ],
      dueDays: "7 days after the lease is signed",
      renewal: ["No fee"],
      earlyLeaseEnd: "50% of the fee paid is refunded if the lease ends within 3 months of its start",
      protectionDays: "90 days after this agreement ends",
    });

    const other = feePolicyModel(
      {
        ...FULL,
        formula: { type: "FIXED_AMOUNT", tiers: [], amount: 2000000, currency: "VND", freeReason: null },
        dueDays: 0,
        renewal: { type: "PERCENT_OF_RENT", tiers: [{ fromMonths: 1, percent: 30 }], amount: null, currency: null, freeReason: null },
        earlyLeaseEnd: { type: "NO_REFUND", refundPercent: null, withinMonths: null },
        protectionDays: 0,
      },
      false,
    );
    expect(lines(other)).toEqual({
      payer: "The owner",
      chargedWhen: "When a lease is signed",
      formula: ["2,000,000 VND per signed lease"],
      dueDays: "On the day the lease is signed",
      renewal: ["From a lease term of 1 month: 30% of one month's rent"],
      earlyLeaseEnd: "No refund",
      protectionDays: "None",
    });

    const free = feePolicyModel(
      {
        ...FULL,
        formula: { type: "FREE", tiers: [], amount: null, currency: null, freeReason: "First unit with Sunvibe" },
        dueDays: 1,
        renewal: { type: "FIXED_AMOUNT", tiers: [], amount: 1000000, currency: "VND", freeReason: null },
        earlyLeaseEnd: { type: "PARTIAL_REFUND", refundPercent: 100, withinMonths: 1 },
        protectionDays: 1,
      },
      false,
    );
    expect(lines(free)).toMatchObject({
      formula: ["Free of charge. Reason: First unit with Sunvibe"],
      dueDays: "1 day after the lease is signed",
      renewal: ["1,000,000 VND per signed lease"],
      earlyLeaseEnd: "100% of the fee paid is refunded if the lease ends within 1 month of its start",
      protectionDays: "1 day after this agreement ends",
    });
  });

  it("feePolicyModel_absentOrNull_notEnteredYet: an answer without feePolicy, and one with every part null, read each part not entered", () => {
    const nothing = {
      payer: "The owner",
      chargedWhen: "When a lease is signed",
      formula: ["Not entered yet"],
      dueDays: "Not entered yet",
      renewal: ["Not entered yet"],
      earlyLeaseEnd: "Not entered yet",
      protectionDays: "Not entered yet",
    };
    expect(lines(feePolicyModel(undefined, false))).toEqual(nothing);
    expect(lines(feePolicyModel(null, false))).toEqual(nothing);
    expect(
      lines(
        feePolicyModel(
          {
            payer: "OWNER",
            chargedWhen: "LEASE_SIGNED",
            formula: null,
            dueDays: null,
            renewal: null,
            earlyLeaseEnd: null,
            protectionDays: null,
          },
          false,
        ),
      ),
    ).toEqual(nothing);
    expect(lines(feePolicyModel({}, false))).toEqual(nothing);
  });

  it("feePolicyModel_unknownCode_otherText: a type this UI does not know reads its OTHER text, never dropped", () => {
    const view = feePolicyModel(
      {
        payer: "TENANT" as never,
        chargedWhen: "MOVE_IN" as never,
        formula: { type: "MONTHLY" as never, tiers: [], amount: null, currency: null, freeReason: null },
        dueDays: 7,
        renewal: { type: "MONTHLY" as never, tiers: [], amount: null, currency: null, freeReason: null },
        earlyLeaseEnd: { type: "FULL_REFUND" as never, refundPercent: null, withinMonths: null },
        protectionDays: 90,
      },
      false,
    );
    expect(lines(view)).toMatchObject({
      payer: "Another payer",
      chargedWhen: "At another moment",
      formula: ["Another way of setting the fee"],
      renewal: ["Another way of setting the fee"],
      earlyLeaseEnd: "Another refund rule",
    });
  });

  it("feePolicyModel_proposed_asGiven: the proposed flag is the one the row passes in (E05S4-P4)", () => {
    expect(feePolicyModel(FULL, true).proposed).toBe(true);
    expect(feePolicyModel(FULL, false).proposed).toBe(false);
    expect(feePolicyModel(undefined, true).proposed).toBe(true);
    expect(t("fee.proposed")).toBe("Proposed fee policy: not confirmed by the owner yet.");
  });

  it("feePolicyModel_unreadableValue_noLine: a value the answer holds but cannot be read gives no line, never a guess", () => {
    const view = feePolicyModel(
      {
        ...FULL,
        formula: { type: "FIXED_AMOUNT", tiers: [], amount: 1.5, currency: "VND", freeReason: null },
        dueDays: 2.5,
        renewal: { type: "PERCENT_OF_RENT", tiers: [{ fromMonths: 1, percent: 0.5 }], amount: null, currency: null, freeReason: null },
        earlyLeaseEnd: { type: "PARTIAL_REFUND", refundPercent: null, withinMonths: 3 },
        protectionDays: -1.5,
      },
      false,
    );
    expect(view).toMatchObject({ formula: [], dueDays: null, renewal: [], earlyLeaseEnd: null, protectionDays: null });
  });
});
