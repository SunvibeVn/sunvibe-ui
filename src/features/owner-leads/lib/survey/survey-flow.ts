import type { ApiResult } from "@/features/auth/client";
import { type SurveyCommandResult, type SurveyUiError, toSurveyUiError } from "@/features/surveys";

/** How a survey command ended: its answer to apply (A-23), or the UI case of the failure (spec 6.7). */
export type SurveyOutcome =
  | { kind: "saved"; result: SurveyCommandResult }
  | { kind: "failed"; error: SurveyUiError };

/** Maps the answer of any survey command. Never throws. */
export function toSurveyOutcome(result: ApiResult<SurveyCommandResult>): SurveyOutcome {
  if (result.ok) return { kind: "saved", result: result.data };
  return { kind: "failed", error: toSurveyUiError(result) ?? { kind: "retry" } };
}

/**
 * Runs one survey command and maps its answer: `send` is the API call with the body already checked and built by the
 * dialog's form module. The callers hold the page's command lock around it (CR-2, Review Focus 5).
 */
export async function runSurveyCommand(send: () => Promise<ApiResult<SurveyCommandResult>>): Promise<SurveyOutcome> {
  return toSurveyOutcome(await send());
}
