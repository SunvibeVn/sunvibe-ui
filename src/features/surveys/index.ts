// Public entry point of the survey feature: the survey and checklist API clients, their types and error mappings (used
// by the Survey section of the lead detail and the checklist page in owner-leads), the survey photo clients (JSON calls,
// the content upload, images, hashing) and the `/workspace/surveys` view.
// Survey data is read only in the browser; this feature never imports @/features/owner-leads.
export * from "./services/surveys-api";
export * from "./services/checklists-api";
export * from "./services/media-api";
export {
  type ImageNotJpeg,
  type ImageResult,
  getMediaImage,
  IMAGE_TIMEOUT_MS,
} from "./services/media-image-client";
export {
  type UploadAborted,
  type UploadInput,
  type UploadResult,
  uploadMediaContent,
  UPLOAD_STALL_MS,
} from "./services/media-upload-transport";
export { type ContentHash, contentDigestHeader, sha256OfBlob } from "./lib/content-hash";
export { type MediaCallContext, type MediaUiError, type MediaUiErrorKind, toMediaUiError } from "./lib/media-ui-error";
export * from "./types";
export { type SurveyUiError, type SurveyUiErrorKind, toSurveyUiError } from "./lib/survey-ui-error";
export {
  type ChecklistDecisionRule,
  type ChecklistSubmitGate,
  type ChecklistUiError,
  type ChecklistUiErrorKind,
  decisionRules,
  submitGates,
  toChecklistUiError,
} from "./lib/checklist-ui-error";
export { type ConfirmationLabel, confirmationLabel, type ReconfirmationCause } from "./lib/confirmation-label";
export { reviewReasonKey } from "./lib/review-queue";
export { SurveyListView } from "./components/survey-list-view";
