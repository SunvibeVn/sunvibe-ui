import type { OwnerLeadsKey, OwnerLeadsTranslate } from "@/features/lead-shared";

import type { MediaUiError, MediaUiErrorKind } from "../media-ui-error";
import { megabytes } from "./media-form";
import type { CoverageRow } from "./media-panel-model";

// The words of a failed photo call (survey-media spec 6.3): one message per kind, the checklist codes with the W16
// texts. Null where the page answers itself (session screens, a 404 leaving the page, a correction box, a queued file,
// a silent retry).

const TEXT: Partial<Record<MediaUiErrorKind, OwnerLeadsKey>> = {
  "upload-disabled": "checklist.media.errors.uploadDisabled",
  "intake-paused": "checklist.media.errors.intakePaused",
  "limit-selected": "checklist.media.errors.limitSelected",
  "rate-expensive": "checklist.media.errors.rateExpensive",
  "serving-disabled": "checklist.media.errors.servingDisabled",
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

/** The limit of spec 6.3's own size text, for an answer that came before any list gave a limit. */
const SPEC_SIZE_LIMIT_BYTES = 20_971_520;

/**
 * The message of `error`, or null when nothing is shown for it. The size message names the `limits.maxFileBytes` of
 * the latest list (spec 6.2 as amended by C-15), or spec 6.3's 20 MB while no list has given one.
 */
export function mediaErrorText(
  error: MediaUiError,
  t: OwnerLeadsTranslate,
  context: { maxFileBytes?: number | null } = {},
): string | null {
  if (error.kind === "too-large") {
    return t("checklist.media.errors.tooLarge", { size: megabytes(context.maxFileBytes ?? SPEC_SIZE_LIMIT_BYTES) });
  }
  if (error.kind === "rate-uploads") return t("checklist.media.errors.rateUploads", { minutes: error.minutes ?? 1 });
  if (error.kind === "rate-budget") return t("checklist.media.errors.rateBudget", { minutes: error.minutes ?? 1 });
  const key = TEXT[error.kind];
  return key === undefined ? null : t(key);
}

/** The message of a failed deselection: its 429 budget is about repeats, not about photo views (handoff 2). */
export function deselectErrorText(error: MediaUiError, t: OwnerLeadsTranslate): string | null {
  if (error.kind === "rate-budget") return t("checklist.media.carried.rateLimited", { minutes: error.minutes ?? 1 });
  return mediaErrorText(error, t);
}

/** The state of a coverage row in words (spec 6.2 Required photos): "Not required" alone when the server names no reason. */
export function coverageStateText(
  row: Pick<CoverageRow, "state" | "readyCount" | "notRequiredReason">,
  optional: boolean,
  t: OwnerLeadsTranslate,
): string {
  if (optional) return t("checklist.media.optional.count", { count: row.readyCount });
  switch (row.state) {
    case "COVERED":
      return t("checklist.media.required.COVERED", { count: row.readyCount });
    case "NOT_REQUIRED": {
      const reason = row.notRequiredReason?.trim() ?? "";
      return reason === ""
        ? t("checklist.media.required.NOT_REQUIRED_NO_REASON")
        : t("checklist.media.required.NOT_REQUIRED", { reason });
    }
    case "PROCESSING":
      return t("checklist.media.required.PROCESSING");
    default:
      return t("checklist.media.required.MISSING");
  }
}
