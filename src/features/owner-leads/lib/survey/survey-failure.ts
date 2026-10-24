import type { SurveyUiError } from "@/features/surveys";

import type { SurveyProblem } from "../../schemas/survey/survey-text";

/** A message key of `OwnerLeads.survey.errors`. */
export type SurveyErrorMessage =
  | "stale"
  | "alreadyScheduled"
  | "notAllowed"
  | "noCurrentVisit"
  | "invalidTransition"
  | "surveyorIneligible"
  | "performerMismatch"
  | "nothingChanged"
  | "badRequest"
  | "forbidden"
  | "failed";

/** What a dialog does with a failed survey command (spec 6.7). */
export type SurveyFailureStep<F extends string> =
  /** 400 naming fields of the dialog: shown at those fields. */
  | { kind: "fields"; problems: Partial<Record<F, SurveyProblem>> }
  /** A message in the dialog; `reload` loads the lead and the survey block again (the draft stays). */
  | { kind: "message"; message: SurveyErrorMessage; reload: boolean; correlationId?: string }
  /** 404: back to the list with the notice. */
  | { kind: "leave" }
  /** Signed out or unavailable: the session screens answer; the dialog keeps its text. */
  | { kind: "session" };

const MESSAGES: Partial<Record<SurveyUiError["kind"], { message: SurveyErrorMessage; reload: boolean }>> = {
  stale: { message: "stale", reload: true },
  "already-scheduled": { message: "alreadyScheduled", reload: true },
  "not-allowed": { message: "notAllowed", reload: true },
  "no-current-visit": { message: "noCurrentVisit", reload: true },
  "invalid-transition": { message: "invalidTransition", reload: true },
  "surveyor-ineligible": { message: "surveyorIneligible", reload: true },
  "performer-mismatch": { message: "performerMismatch", reload: false },
  forbidden: { message: "forbidden", reload: false },
  form: { message: "nothingChanged", reload: false },
};

/**
 * Maps a survey failure to the dialog's next step, by kind (the API `code`), never by the server's message. `fields`
 * maps the API field names to the dialog's fields; a 400 on any other field gives the general message.
 */
export function surveyFailure<F extends string>(
  error: SurveyUiError,
  fields: Readonly<Record<string, F>>,
): SurveyFailureStep<F> {
  const support = error.correlationId === undefined ? {} : { correlationId: error.correlationId };
  switch (error.kind) {
    case "not-found":
      return { kind: "leave" };
    case "signed-out":
    case "unavailable":
      return { kind: "session" };
    case "validation": {
      const problems: Partial<Record<F, SurveyProblem>> = {};
      for (const apiField of Object.keys(error.fieldErrors ?? {})) {
        if (Object.hasOwn(fields, apiField)) problems[fields[apiField]] = "invalid";
      }
      return Object.keys(problems).length > 0
        ? { kind: "fields", problems }
        : { kind: "message", message: "badRequest", reload: false, ...support };
    }
    default: {
      const known = MESSAGES[error.kind];
      return known === undefined
        ? { kind: "message", message: "failed", reload: false, ...support }
        : { kind: "message", ...known, ...support };
    }
  }
}
