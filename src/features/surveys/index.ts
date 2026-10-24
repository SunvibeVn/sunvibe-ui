// Public entry point of the survey feature: the survey and checklist API clients, their types and error mappings (used
// by the Survey section of the lead detail and the checklist page in owner-leads), and the `/workspace/surveys` view.
// Survey data is read only in the browser; this feature never imports @/features/owner-leads.
export * from "./services/surveys-api";
export * from "./services/checklists-api";
export * from "./types";
export { type SurveyUiError, type SurveyUiErrorKind, toSurveyUiError } from "./lib/survey-ui-error";
export { type ChecklistUiError, type ChecklistUiErrorKind, toChecklistUiError } from "./lib/checklist-ui-error";
export { type ConfirmationLabel, confirmationLabel, type ReconfirmationCause } from "./lib/confirmation-label";
export { SurveyListView } from "./components/survey-list-view";
