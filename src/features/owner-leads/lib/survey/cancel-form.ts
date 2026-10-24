import { z } from "zod";
import { type CancelAppointmentInput, USER_CANCEL_REASONS, type UserCancelReason } from "@/features/surveys";

import {
  addProblem,
  checkText,
  crossChecks,
  optionalText,
  problemsOf,
  REASON_MAX,
  requiredText,
  type SurveyProblems,
} from "../../schemas/survey/survey-text";

import { putText } from "./booking-form";

/** The cancel dialog (spec 6.2): one of the five user reasons and a description (required for Other, A-26). */
export type CancelForm = { reason: string; description: string };

export type CancelField = "reason" | "description";

const isUserReason = (value: string): value is UserCancelReason =>
  (USER_CANCEL_REASONS as readonly string[]).includes(value);

/** Checks the cancel dialog: a user reason, a description of 1..500 for Other, no phone number. `{}` when valid. */
export function validateCancel(form: CancelForm): SurveyProblems<CancelField> {
  const rest = crossChecks((refine) => {
    if (form.reason === "") addProblem(refine, "reason", "required");
    else if (!isUserReason(form.reason)) addProblem(refine, "reason", "invalid");
    const schema = form.reason === "OTHER" ? requiredText(REASON_MAX) : optionalText(REASON_MAX);
    checkText(refine, "description", schema, form.description);
  });
  return problemsOf<CancelField>(z.object({}).safeParse(form), rest);
}

/** The cancellation body of a checked form; a blank description is left out (A-24). */
export function toCancelBody(
  form: CancelForm,
  ctx: { leadVersion: number; appointmentVersion: number },
): CancelAppointmentInput {
  const body: CancelAppointmentInput = {
    expectedLeadVersion: ctx.leadVersion,
    expectedAppointmentVersion: ctx.appointmentVersion,
    cancelReason: form.reason as UserCancelReason,
  };
  putText(body, "description", form.description);
  return body;
}
