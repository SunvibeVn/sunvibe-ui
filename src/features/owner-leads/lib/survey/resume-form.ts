import { z } from "zod";
import type { ResumeSurveyInput } from "@/features/surveys";
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
} from "../../schemas/survey/survey-text";

/** The resume dialog (spec 6.2): a reason and the owner's confirmation that requirement and scope have not changed. */
export type ResumeForm = { reason: string; basisDate: string; basisText: string };

export type ResumeField = "reason" | "basisDate" | "basisText";

/**
 * Checks the resume dialog (BR-11, A-25): reason and basis text of 1..500 without a phone number, a basis date not
 * after today (the server checks it is not before the hold). `{}` when valid.
 */
export function validateResume(form: ResumeForm, ctx: { now: number }): SurveyProblems<ResumeField> {
  const texts = z.object({ reason: requiredText(REASON_MAX), basisText: requiredText(REASON_MAX) });
  const rest = crossChecks((refine) => {
    const problem = basisDateProblem(form.basisDate, vietnamDate(new Date(ctx.now).toISOString()));
    if (problem !== null) addProblem(refine, "basisDate", problem);
  });
  return problemsOf<ResumeField>(texts.safeParse(form), rest);
}

/** The resumption body of a checked form. */
export function toResumeBody(form: ResumeForm, ctx: { leadVersion: number }): ResumeSurveyInput {
  return {
    expectedLeadVersion: ctx.leadVersion,
    reason: cleanText(form.reason),
    basis: { confirmedOn: form.basisDate, text: cleanText(form.basisText) },
  };
}
