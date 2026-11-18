import { z } from "zod";

// The terms of a draft as the server checks them (brokerage-agreement BR-8, S3-D8, spec section 4). Each issue's message
// is the problem of its field (lib/draft-edit-form.ts turns it into a text). The period is checked by the draft
// dialog's rules (lib/agreement-draft-form.ts), reused, not copied.

/** The largest amount of VND (ADR-006), below 2^53 so every amount is an exact number. */
export const MAX_AMOUNT = 999_999_999_999_999;
/** At most twenty mandatory fees in one version (brokerage-agreement BR-8). */
export const MAX_FEES = 20;
export const MAX_FEE_NAME = 100;

/** Whole numbers typed without separators, signs or fractions: at most 15 digits, so never above MAX_AMOUNT's size. */
const DIGITS = /^\d{1,15}$/;
// The server refuses a fee name holding a control character U+0000 to U+001F.
const CONTROL_CHARACTER = /[\u0000-\u001f]/;

const kind = (problem: string) => ({ error: problem });

/** A whole number from `min` to `max`, typed as digits only. */
const wholeIn = (min: number, max: number) => (value: string) =>
  DIGITS.test(value) && Number(value) >= min && Number(value) <= max;

/** An empty field is not entered yet, and passes. */
const emptyOr = (check: (value: string) => boolean) => (value: string) => value === "" || check(value);

// zod `.max()` counts code points; the server counts UTF-16 units (String.length), so the length is checked directly.
const feeName = z
  .string()
  .refine((name) => {
    const trimmed = name.trim();
    return trimmed.length >= 1 && trimmed.length <= MAX_FEE_NAME && !CONTROL_CHARACTER.test(trimmed);
  }, kind("feeName"));

/** One fee row: an amount needs its value and its unit; included and the provider's rate need neither. */
const feeRow = z.discriminatedUnion("basis", [
  z.object({
    basis: z.literal("AMOUNT"),
    name: feeName,
    amount: z.string().refine(wholeIn(1, MAX_AMOUNT), kind("feeAmount")),
    chargeUnit: z.string().refine((unit) => unit !== "", kind("feeUnit")),
  }),
  z.object({ basis: z.literal("INCLUDED"), name: feeName }),
  z.object({ basis: z.literal("PROVIDER_TARIFF"), name: feeName }),
]);

export const draftEditSchema = z
  .object({
    monthlyRent: z.string().refine(emptyOr(wholeIn(1, MAX_AMOUNT)), kind("amount")),
    depositBasis: z.enum(["", "MONTHS", "AMOUNT"]),
    depositMonths: z.string(),
    depositAmount: z.string(),
    minimumTermMonths: z.string().refine(emptyOr(wholeIn(1, 120)), kind("minimumTerm")),
    paymentPeriodMonths: z.string().refine(emptyOr(wholeIn(1, 12)), kind("paymentPeriod")),
    fees: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("notStated") }),
      z.object({ kind: z.literal("none") }),
      z.object({ kind: z.literal("list"), rows: z.array(feeRow).max(MAX_FEES, kind("tooManyFees")) }),
    ]),
  })
  // A deposit of 0 to 12 months of rent, or of 0 VND up to the largest amount; 0 is no deposit. Only the value of the
  // chosen basis counts.
  .superRefine((form, context) => {
    if (form.depositBasis === "MONTHS" && !emptyOr(wholeIn(0, 12))(form.depositMonths)) {
      context.addIssue({ code: "custom", path: ["depositMonths"], message: "depositMonths" });
    }
    if (form.depositBasis === "AMOUNT" && !emptyOr(wholeIn(0, MAX_AMOUNT))(form.depositAmount)) {
      context.addIssue({ code: "custom", path: ["depositAmount"], message: "depositAmount" });
    }
  });
