import type { OwnerLeadsKey } from "../../lib/labels";
import type { SurveyErrorMessage } from "../../lib/survey/survey-failure";
import type { SurveyProblem } from "../../schemas/survey/survey-text";

/** `useTranslations("OwnerLeads")` as the survey parts use it. */
export type SurveyT = (key: OwnerLeadsKey, values?: Record<string, string | number>) => string;

/** Which kind of value a field holds, for the time and date messages. */
export type FieldKind = "start" | "arrival" | "date" | "text";

/** The message of a field problem; `max` fills the length message. */
export function problemText(t: SurveyT, problem: SurveyProblem, kind: FieldKind = "text", max?: number): string {
  switch (problem) {
    case "tooEarly":
      return t(kind === "start" ? "survey.problems.startTooEarly" : "survey.problems.dateTooEarly");
    case "tooLate":
      if (kind === "start") return t("survey.problems.startTooLate");
      return t(kind === "arrival" ? "survey.problems.arrivedTooLate" : "survey.problems.dateTooLate");
    case "tooLong":
      return t("survey.problems.tooLong", { max: max ?? 0 });
    default:
      return t(`survey.problems.${problem}`);
  }
}

/** The message key of a failed survey command. */
export const errorKey = (message: SurveyErrorMessage): OwnerLeadsKey => `survey.errors.${message}`;
