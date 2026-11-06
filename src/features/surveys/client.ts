// Public entry point for Client Components and the plain modules they use: what the lead page takes from the survey UI.
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
export { surveyFailure, type SurveyFailureStep } from "./lib/survey/survey-failure";
