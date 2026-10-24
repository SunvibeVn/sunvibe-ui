import { z } from "zod";

import { containsPhoneNumber } from "../../lib/survey/phone-in-text";

// The free-text and time rules shared by the survey and requirement forms (survey-schedule BR-4, spec A-14, A-24,
// A-25, Global Constraints of the plan). Issue messages are `SurveyProblem` values; the dialogs turn them into texts.

/** What is wrong with one field of a survey form. */
export type SurveyProblem = "required" | "tooLong" | "phone" | "invalid" | "tooEarly" | "tooLate" | "notAllowed";

/** Field name -> its first problem; `{}` when the form is valid. */
export type SurveyProblems<F extends string> = Partial<Record<F, SurveyProblem>>;

export const ADDRESS_MAX = 255;
export const ACCESS_NOTE_MAX = 1000;
export const CONTACT_MAX = 100;
/** Reasons, the user cancel description, the confirmation note and basis texts. */
export const REASON_MAX = 500;
export const VISIT_NOTE_MAX = 2000;

const kind = (problem: SurveyProblem) => ({ error: problem });

/** The text as the server keeps it: NFC and trimmed (its length is counted in UTF-16 units, as the server does). */
export const cleanText = (value: string): string => value.normalize("NFC").trim();

/** Required text of 1..max characters without a phone number. */
export const requiredText = (max: number) =>
  z
    .string()
    .refine((value) => cleanText(value) !== "", kind("required"))
    .refine((value) => cleanText(value).length <= max, kind("tooLong"))
    .refine((value) => !containsPhoneNumber(cleanText(value)), kind("phone"));

/** Optional text: blank counts as absent (A-24), otherwise as `requiredText`. */
export const optionalText = (max: number) =>
  z
    .string()
    .refine((value) => cleanText(value).length <= max, kind("tooLong"))
    .refine((value) => !containsPhoneNumber(cleanText(value)), kind("phone"));

/** Untouched string (a field whose check depends on another field is checked in `superRefine`). */
export const anyText = z.string();

/** Reports `problem` on `field` from inside a `superRefine`. */
export function addProblem(ctx: z.RefinementCtx, field: string, problem: SurveyProblem): void {
  ctx.addIssue({ code: "custom", path: [field], message: problem });
}

/**
 * The first problem per top-level field of one or more parse results, the earlier result first. Cross-field checks run
 * as a separate `crossChecks` parse, because zod skips an object's refinements once one of its fields failed.
 */
export function problemsOf<F extends string>(...results: z.ZodSafeParseResult<unknown>[]): SurveyProblems<F> {
  const problems: SurveyProblems<F> = {};
  for (const result of results) {
    if (result.success) continue;
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "") as F;
      if (field !== "" && problems[field] === undefined) problems[field] = issue.message as SurveyProblem;
    }
  }
  return problems;
}

/** A parse that always runs `check` (it reports through `addProblem`), whatever the other fields hold. */
export function crossChecks(check: (ctx: z.RefinementCtx) => void): z.ZodSafeParseResult<unknown> {
  return z.unknown().superRefine((_value, ctx) => check(ctx)).safeParse(null);
}

/** Reports the first problem of `text` against `schema` on `field`. */
export function checkText(ctx: z.RefinementCtx, field: string, schema: z.ZodType<string>, text: string): void {
  const result = schema.safeParse(text);
  if (!result.success) addProblem(ctx, field, result.error.issues[0].message as SurveyProblem);
}

const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::00)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The instant (ms) of a `datetime-local` value read as Vietnam time, in whole minutes; a problem when it is empty,
 * not a real time or carries seconds (A-25).
 */
export function minuteInstant(value: string, toInstant: (value: string) => string): number | "required" | "invalid" {
  if (value === "") return "required";
  if (!LOCAL_MINUTE.test(value)) return "invalid";
  try {
    return Date.parse(toInstant(value));
  } catch {
    return "invalid";
  }
}

/** The start of the minute of `now` (ms). */
export const minuteOf = (now: number): number => now - (now % 60_000);

/** True for a real `yyyy-MM-dd` date. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Checks a basis date (`yyyy-MM-dd`, Vietnam): required, real, not after `today` and, when given, not before
 * `earliest` (A-25). Null when fine.
 */
export function basisDateProblem(value: string, today: string, earliest?: string): SurveyProblem | null {
  if (value === "") return "required";
  if (!isIsoDate(value)) return "invalid";
  if (value > today) return "tooLate";
  if (earliest !== undefined && earliest !== "" && value < earliest) return "tooEarly";
  return null;
}

/** The value of a duration select: 15..480 in steps of 15 (BR-4); null for anything else. */
export function durationOf(value: string): number | null {
  if (!/^\d{1,3}$/.test(value)) return null;
  const minutes = Number(value);
  return minutes >= 15 && minutes <= 480 && minutes % 15 === 0 ? minutes : null;
}

/** The durations the select offers, in minutes. */
export const DURATIONS: readonly number[] = Array.from({ length: 32 }, (_, index) => (index + 1) * 15);

/** At most 90 days after the current minute (BR-4). */
export const MAX_DAYS_AHEAD = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The start-window problem of a start (ms) for `now` (ms): not before the current minute, at most 90 days after it. */
export function startWindowProblem(start: number, now: number): SurveyProblem | null {
  const current = minuteOf(now);
  if (start < current) return "tooEarly";
  if (start > current + MAX_DAYS_AHEAD * DAY_MS) return "tooLate";
  return null;
}
