import { z } from "zod";

import { MAX_AMOUNT } from "./draft-edit.schema";

// The fee policy of a draft as the server checks it (brokerage-agreement BR-7, E-13, S4-D3, spec section 4). Each
// issue's message is the problem of its field (lib/fee-policy-form.ts turns it into a text). No part has a default and
// no fee is computed.

/** brokerage-agreement BR-7: at most five tiers by lease term. */
export const MAX_TIERS = 5;
/** The reason of a fee free of charge: 1 to 500 UTF-16 units once trimmed, and at most 500 as typed (E05S4-P3). */
export const MAX_FREE_REASON = 500;

/** Whole numbers typed without separators, signs or fractions: at most 15 digits, so never above MAX_AMOUNT's size. */
const DIGITS = /^\d{1,15}$/;
/**
 * A character that can hide or reorder the text the owner confirms, which the server refuses in the reason: a control
 * character (U+0000 to U+001F, U+007F to U+009F) or a bidirectional formatting character (U+200E, U+200F, U+202A to
 * U+202E, U+2066 to U+2069).
 */
const HIDDEN_CHARACTER = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/;

const kind = (problem: string) => ({ error: problem });

/** A whole number from `min` to `max`, typed as digits only. */
const wholeIn = (min: number, max: number) => (value: string) =>
  DIGITS.test(value) && Number(value) >= min && Number(value) <= max;

/** An empty field is not entered yet, and passes. */
const emptyOr = (check: (value: string) => boolean) => (value: string) => value === "" || check(value);

const isStart = wholeIn(1, 120);

const tier = z.object({
  fromMonths: z.string().refine(isStart, kind("tierStart")),
  percent: z.string().refine(wholeIn(1, 300), kind("percent")),
});

/**
 * 1 to 5 tiers: the first starts at a term of 1 month and each start is above the one before, so the tiers never
 * overlap and cover every term (brokerage-agreement BR-7, S4-D3). The percentages are not ordered.
 */
const tiers = z
  .array(tier)
  .max(MAX_TIERS, kind("tooManyTiers"))
  .superRefine((list, context) => {
    const [first] = list;
    if (first === undefined) {
      context.addIssue({ code: "custom", path: [], message: "tierStart" });
      return;
    }
    if (first.fromMonths !== "1") context.addIssue({ code: "custom", path: [0, "fromMonths"], message: "tierStart" });
    list.forEach((current, index) => {
      const before = list[index - 1];
      if (before === undefined || !isStart(before.fromMonths) || !isStart(current.fromMonths)) return;
      if (Number(current.fromMonths) <= Number(before.fromMonths)) {
        context.addIssue({ code: "custom", path: [index, "fromMonths"], message: "tierOrder" });
      }
    });
  });

// zod `.max()` counts code points; the server counts UTF-16 units (String.length), so the length is checked directly.
const freeReason = z.string().superRefine((typed, context) => {
  const reason = typed.trim();
  if (typed.length > MAX_FREE_REASON || reason.length < 1 || reason.length > MAX_FREE_REASON) {
    context.addIssue({ code: "custom", message: "freeReason" });
  } else if (HIDDEN_CHARACTER.test(reason)) {
    context.addIssue({ code: "custom", message: "freeReasonCharacters" });
  }
});

const notEntered = z.object({ kind: z.literal("") });
const percentOfRent = z.object({ kind: z.literal("PERCENT_OF_RENT"), tiers });
const fixedAmount = z.object({
  kind: z.literal("FIXED_AMOUNT"),
  amount: z.string().refine(wholeIn(1, MAX_AMOUNT), kind("fixedAmount")),
});

export const feePolicySchema = z.object({
  // How the fee is set: a percentage of one month's rent by tiers, a fixed amount, or free of charge with a reason.
  formula: z.discriminatedUnion("kind", [
    notEntered,
    percentOfRent,
    fixedAmount,
    z.object({ kind: z.literal("FREE"), freeReason }),
  ]),
  // Days after the lease is signed; 0 is the signing day.
  dueDays: z.string().refine(emptyOr(wholeIn(0, 30)), kind("dueDays")),
  // The fee of a renewal with the same tenant: none, a percentage by tiers, or a fixed amount.
  renewal: z.discriminatedUnion("kind", [notEntered, z.object({ kind: z.literal("NOT_CHARGED") }), percentOfRent, fixedAmount]),
  // An early lease end: no refund, or a share of the fee paid when the lease ends within some months of its start.
  earlyLeaseEnd: z.discriminatedUnion("kind", [
    notEntered,
    z.object({ kind: z.literal("NO_REFUND") }),
    z.object({
      kind: z.literal("PARTIAL_REFUND"),
      refundPercent: z.string().refine(wholeIn(1, 100), kind("refundPercent")),
      withinMonths: z.string().refine(wholeIn(1, 12), kind("withinMonths")),
    }),
  ]),
  // The protection period: days after this agreement ends; 0 is none.
  protectionDays: z.string().refine(emptyOr(wholeIn(0, 180)), kind("protectionDays")),
});
