// Public entry point of the survey feature: the survey API client, its types and the error mapping (used by the
// Survey section of the lead detail in owner-leads), and the `/workspace/surveys` view. Survey data is read only in
// the browser; this feature never imports @/features/owner-leads.
export * from "./services/surveys-api";
export * from "./types";
export { type SurveyUiError, type SurveyUiErrorKind, toSurveyUiError } from "./lib/survey-ui-error";
export { type ConfirmationLabel, confirmationLabel, type ReconfirmationCause } from "./lib/confirmation-label";
export { SurveyListView } from "./components/survey-list-view";
