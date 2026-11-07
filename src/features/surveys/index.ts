// Public entry point of the survey feature: the `/workspace/surveys` view, and the logic and types owner-leads reads.
// The survey UI of a lead is in client.ts: a route loads every client component of the entry it imports, so that UI stays
// out of this file and off `/workspace/surveys`.
// Survey data is read only in the browser; this feature never imports @/features/owner-leads.
export { SurveyListView } from "./components/survey-list-view";
export { historyActivityText } from "./lib/history-activity-text";
export { surveyFailure } from "./lib/survey/survey-failure";
export { toSurveyUiError } from "./lib/survey-ui-error";
export {
  addProblem,
  basisDateProblem,
  cleanText,
  crossChecks,
  problemsOf,
  REASON_MAX,
  requiredText,
  type SurveyProblem,
  type SurveyProblems,
} from "./schemas/survey/survey-text";
export { getSurvey } from "./services/surveys-api";
export type { ChecklistStarted, SurveyBlock, SurveyCommandResult, SurveyHistoryEntry } from "./types";
