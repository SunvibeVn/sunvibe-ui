import type { MediaUiError, MediaUiErrorKind } from "@/features/surveys";

import type { OwnerLeadsTranslate } from "../history-activity-text";
import type { OwnerLeadsKey } from "../labels";

// The words of a failed photo call (survey-media spec 6.3): one message per kind, the checklist codes with the W16
// texts. Null where the page answers itself (session screens, a 404 leaving the page, a correction box, a queued file,
// a silent retry).

const TEXT: Partial<Record<MediaUiErrorKind, OwnerLeadsKey>> = {
  "upload-disabled": "checklist.media.errors.uploadDisabled",
  "intake-paused": "checklist.media.errors.intakePaused",
  "limit-selected": "checklist.media.errors.limitSelected",
  "rate-expensive": "checklist.media.errors.rateExpensive",
  "serving-disabled": "checklist.media.errors.servingDisabled",
  "too-large": "checklist.media.errors.tooLarge",
  duplicate: "checklist.media.errors.duplicate",
  "other-visit": "checklist.media.errors.otherVisit",
  referenced: "checklist.media.errors.referenced",
  "not-available": "checklist.media.errors.notAvailable",
  busy: "checklist.media.errors.busy",
  "upload-again": "checklist.media.errors.uploadAgain",
  "in-progress": "checklist.media.errors.inProgress",
  malformed: "checklist.media.errors.malformed",
  "state-unknown": "checklist.media.errors.stateUnknown",
  stale: "checklist.media.errors.stale",
  validation: "checklist.errors.badRequest",
  retry: "checklist.errors.failed",
  forbidden: "checklist.errors.forbidden",
  "read-only": "checklist.errors.readOnlyNow",
  "takeover-required": "checklist.errors.takeoverRequired",
  "surveyor-ineligible": "checklist.errors.surveyorIneligible",
};

/** The message of `error`, or null when nothing is shown for it. */
export function mediaErrorText(error: MediaUiError, t: OwnerLeadsTranslate): string | null {
  if (error.kind === "rate-uploads") return t("checklist.media.errors.rateUploads", { minutes: error.minutes ?? 1 });
  if (error.kind === "rate-budget") return t("checklist.media.errors.rateBudget", { minutes: error.minutes ?? 1 });
  const key = TEXT[error.kind];
  return key === undefined ? null : t(key);
}
