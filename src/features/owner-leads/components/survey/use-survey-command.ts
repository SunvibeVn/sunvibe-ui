"use client";

import { useActionState, useRef } from "react";
import type { ApiResult } from "@/features/auth/client";
import type { SurveyCommandResult } from "@/features/surveys";

import { type SurveyErrorMessage, surveyFailure } from "../../lib/survey/survey-failure";
import { runSurveyCommand } from "../../lib/survey/survey-flow";
import type { SurveyProblem } from "../../schemas/survey/survey-text";
import { useLeadDetail } from "../lead-detail-context";

import type { SurveyDialogMessage } from "./survey-message";
import { useSurveyLock } from "./use-survey-lock";

export type SurveyCommandState<F extends string> = {
  problems: Partial<Record<F, SurveyProblem>>;
  message: SurveyDialogMessage | null;
};

type SurveyCommandOptions<F extends string> = {
  /** Checks the dialog; `{}` when it can be sent. */
  check(): Partial<Record<F, SurveyProblem>>;
  /** A refusal decided here after the checks passed (e.g. "Nothing changed."); null to send. */
  refuse?(): SurveyErrorMessage | null;
  /** Sends the command built from the dialog's values (called only after `check` passed). */
  send(): Promise<ApiResult<SurveyCommandResult>>;
  /** API field name -> the dialog's field, for a 400. */
  fields: Readonly<Record<string, F>>;
  /** After the answer was applied to the page: clear the draft and close. */
  onSaved(result: SurveyCommandResult): void;
};

/**
 * The action of a survey dialog (native form action): checks, sends, applies the answer to the page without a reload
 * (A-23) or maps the failure by its code (spec 6.7): fields, a message (with a reload of the lead and the survey block
 * for a conflict; the draft stays), back to the list for a 404. Holds the page's command lock while it runs.
 */
export function useSurveyCommand<F extends string>(options: SurveyCommandOptions<F>) {
  const controller = useLeadDetail();
  const initial: SurveyCommandState<F> = { problems: {}, message: null };
  /** Set once the command saved: a submit queued behind it (double click) sends nothing (Review Focus 5). */
  const saved = useRef(false);

  const [state, dispatch, pending] = useActionState(
    async (prev: SurveyCommandState<F>): Promise<SurveyCommandState<F>> => {
      if (saved.current) return prev;
      const problems = options.check();
      if (Object.keys(problems).length > 0) return { problems, message: null };
      const refused = options.refuse?.() ?? null;
      if (refused !== null) return { problems: {}, message: { message: refused } };

      const outcome = await runSurveyCommand(options.send);
      if (outcome.kind === "saved") {
        saved.current = true;
        controller.applySurveyResult(outcome.result);
        options.onSaved(outcome.result);
        return initial;
      }
      const step = surveyFailure(outcome.error, options.fields);
      switch (step.kind) {
        case "leave":
          controller.leaveToList();
          return prev;
        case "session":
          return prev;
        case "fields":
          return { problems: step.problems, message: null };
        case "message": {
          if (step.reload) await controller.reload();
          const message: SurveyDialogMessage =
            step.correlationId === undefined
              ? { message: step.message }
              : { message: step.message, correlationId: step.correlationId };
          return { problems: {}, message };
        }
      }
    },
    initial,
  );
  useSurveyLock(pending);
  return { state, dispatch, pending };
}
