import { z } from "zod";
import { vietnamDate } from "@/lib/format/vietnam-time";

import {
  addProblem,
  basisDateProblem,
  cleanText,
  crossChecks,
  problemsOf,
  REASON_MAX,
  requiredText,
  type SurveyProblems,
} from "../schemas/survey/survey-text";
import type { ChangeIntentInput } from "../services/owner-leads-api";

/** The intents a requirement change may move to (US-5 AC-1): rentals only, never sale. */
export const RENTAL_INTENTS = ["SHORT_TERM_RENT", "LONG_TERM_RENT"] as const;
export type RentalIntent = (typeof RENTAL_INTENTS)[number];

/** The change requirement dialog (spec 6.2, A-18). `amount` as typed; `noPrice` = "No price until confirmed". */
export type RequirementForm = {
  newIntent: string;
  amount: string;
  noPrice: boolean;
  reason: string;
  basisDate: string;
  basisText: string;
};

export type RequirementField = "newIntent" | "amount" | "reason" | "basisDate" | "basisText";

export const REQUIREMENT_DEFAULTS: RequirementForm = {
  newIntent: "",
  amount: "",
  noPrice: false,
  reason: "",
  basisDate: "",
  basisText: "",
};

/** The statuses a requirement change starts from (spec 4.6); never NEW or a closed lead. */
const FROM_STATUSES: readonly string[] = ["ASSIGNED", "CONTACTED", "ON_HOLD", "SURVEY_SCHEDULED"];

/** Most digits of an amount (the intake rule: 1..15 digits, whole VND). */
const AMOUNT_DIGITS = 15;

export function canChangeRequirement(status: string | undefined): boolean {
  return status !== undefined && FROM_STATUSES.includes(status);
}

/** The rental intents other than the current one; a sale lead (or one without an intent) gets both. */
export function offeredIntents(current: string | null | undefined): RentalIntent[] {
  return RENTAL_INTENTS.filter((intent) => intent !== current);
}

/** The price unit of a rental intent (US-5 AC-2): per night for short-term, per month for long-term. */
export function priceUnitOf(intent: string): "NIGHT" | "MONTH" | null {
  if (intent === "SHORT_TERM_RENT") return "NIGHT";
  if (intent === "LONG_TERM_RENT") return "MONTH";
  return null;
}

/** The digits of a typed amount ("12.000.000" -> "12000000"); null when it is not a whole positive amount. */
function amountOf(value: string): string | null {
  const digits = value.replace(/[\s.,]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const trimmed = digits.replace(/^0+/, "");
  return trimmed === "" || trimmed.length > AMOUNT_DIGITS ? null : trimmed;
}

/** The requirement change body (A-17): `askingPrice` always present, `null` for "No price until confirmed". */
export function toIntentBody(form: RequirementForm, ctx: { leadVersion: number }): ChangeIntentInput {
  const unit = priceUnitOf(form.newIntent);
  const amount = amountOf(form.amount);
  return {
    expectedVersion: ctx.leadVersion,
    newIntent: form.newIntent as RentalIntent,
    askingPrice: form.noPrice || unit === null || amount === null ? null : { amount, currency: "VND", unit },
    reason: cleanText(form.reason),
    basis: { confirmedOn: form.basisDate, text: cleanText(form.basisText) },
  };
}

/**
 * Checks the dialog (US-5, BR-10, A-14, A-25): an offered rental intent, a price or "No price until confirmed", reason
 * and basis text of 1..500 without a phone number, and a basis date from the lead's creation day to today.
 */
export function validateRequirement(
  form: RequirementForm,
  ctx: { current: string | null | undefined; leadCreatedAt: string | null | undefined; now: number },
): SurveyProblems<RequirementField> {
  const texts = z.object({ reason: requiredText(REASON_MAX), basisText: requiredText(REASON_MAX) });
  const rest = crossChecks((refine) => {
    if (form.newIntent === "") addProblem(refine, "newIntent", "required");
    else if (!(offeredIntents(ctx.current) as string[]).includes(form.newIntent)) addProblem(refine, "newIntent", "invalid");
    if (!form.noPrice) {
      if (form.amount.trim() === "") addProblem(refine, "amount", "required");
      else if (amountOf(form.amount) === null) addProblem(refine, "amount", "invalid");
    }
    const created = ctx.leadCreatedAt ? vietnamDate(ctx.leadCreatedAt) : undefined;
    const date = basisDateProblem(form.basisDate, vietnamDate(new Date(ctx.now).toISOString()), created);
    if (date !== null) addProblem(refine, "basisDate", date);
  });
  return problemsOf<RequirementField>(texts.safeParse(form), rest);
}
