import type { ApiResult } from "@/features/auth/client";

/** What a failed survey call means for the workspace UI (spec 6.7). */
export type SurveyUiErrorKind =
  | "signed-out"
  | "unavailable"
  | "forbidden"
  | "not-found"
  | "validation"
  | "form"
  | "stale"
  | "already-scheduled"
  | "not-allowed"
  | "no-current-visit"
  | "invalid-transition"
  | "surveyor-ineligible"
  | "performer-mismatch"
  | "retry";

export type SurveyUiError = {
  kind: SurveyUiErrorKind;
  /** `validation` only: API field name -> the first server message for that field (never shown as is). */
  fieldErrors?: Record<string, string>;
  /** Shown in small text under every message when present (ADR-010). */
  correlationId?: string;
};

const CONFLICTS: Record<string, SurveyUiErrorKind> = {
  CONCURRENT_MODIFICATION: "stale",
  SURVEY_ALREADY_SCHEDULED: "already-scheduled",
  SURVEY_NOT_ALLOWED: "not-allowed",
  NO_CURRENT_VISIT: "no-current-visit",
  INVALID_STATE_TRANSITION: "invalid-transition",
};

const UNPROCESSABLE: Record<string, SurveyUiErrorKind> = {
  SURVEYOR_INELIGIBLE: "surveyor-ineligible",
  PERFORMER_MISMATCH: "performer-mismatch",
};

const withCorrelation = (value: SurveyUiError, correlationId: string | undefined): SurveyUiError =>
  correlationId === undefined ? value : { ...value, correlationId };

const byCode = (table: Record<string, SurveyUiErrorKind>, code: string | undefined): SurveyUiErrorKind | undefined =>
  code !== undefined && Object.hasOwn(table, code) ? table[code] : undefined;

/**
 * Maps a survey call result to the UI case of spec 6.7 by its `code`, never its message; null for a success. Never
 * throws. 400 with fields -> `validation`; `VALIDATION_FAILED` without fields ("Nothing changed.") -> `form`, any other
 * 400 -> `validation` with no field; an unknown 409 -> `stale` (reload, drafts kept); an unknown 422, 429, 5xx and
 * network -> `retry`.
 */
export function toSurveyUiError(result: ApiResult<unknown>): SurveyUiError | null {
  if (result.ok) return null;
  switch (result.kind) {
    case "signed-out":
      return { kind: "signed-out" };
    case "unavailable":
      return { kind: "unavailable" };
    case "network":
      return { kind: "retry" };
    case "http":
      break;
  }

  const { status, code, fieldErrors, correlationId } = result;
  switch (status) {
    case 400: {
      // Only the API's own check names no field ("Nothing changed."); a malformed body is a general 400.
      if (fieldErrors.length === 0 && code === "VALIDATION_FAILED") return withCorrelation({ kind: "form" }, correlationId);
      const fields = new Map<string, string>();
      for (const { field, message } of fieldErrors) {
        if (!fields.has(field)) fields.set(field, message);
      }
      return withCorrelation({ kind: "validation", fieldErrors: Object.fromEntries(fields) }, correlationId);
    }
    case 403:
      return withCorrelation({ kind: "forbidden" }, correlationId);
    case 404:
      return withCorrelation({ kind: "not-found" }, correlationId);
    case 409:
      return withCorrelation({ kind: byCode(CONFLICTS, code) ?? "stale" }, correlationId);
    case 422:
      return withCorrelation({ kind: byCode(UNPROCESSABLE, code) ?? "retry" }, correlationId);
    default:
      return withCorrelation({ kind: "retry" }, correlationId);
  }
}
