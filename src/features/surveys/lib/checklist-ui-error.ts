import type { ApiResult } from "@/features/auth/client";

import { CHECKLIST_GROUP_PATHS, type ChecklistGroupPath } from "../types";

/** What a failed checklist call means for the page (survey-checklist spec 6.3). */
export type ChecklistUiErrorKind =
  | "signed-out"
  | "unavailable"
  | "forbidden"
  | "not-found"
  | "validation"
  | "correction-required"
  | "form"
  | "stale"
  | "read-only"
  | "takeover-required"
  | "not-allowed"
  | "already-started"
  | "surveyor-ineligible"
  | "retry";

export type ChecklistUiError = {
  kind: ChecklistUiErrorKind;
  /** `validation`, `correction-required`: JSON path -> the first server message for it (never shown as is). */
  fieldErrors?: Record<string, string>;
  /** `stale`: the other group whose version was stale (`otherGroupVersions.<group>`), null for the saved group. */
  staleGroup?: ChecklistGroupPath | null;
  /** `not-allowed`: the field of CHECKLIST_NOT_ALLOWED (`appointmentId`, `intent`, `status`, `holder`), or null. */
  notAllowedField?: string | null;
  /** Shown in small text under every message when present (ADR-010). */
  correlationId?: string;
};

const CONFLICTS: Record<string, ChecklistUiErrorKind> = {
  CHECKLIST_READ_ONLY: "read-only",
  CHECKLIST_TAKEOVER_REQUIRED: "takeover-required",
  CHECKLIST_ALREADY_STARTED: "already-started",
};

const OTHER_GROUP = "otherGroupVersions.";

const withCorrelation = (value: ChecklistUiError, correlationId: string | undefined): ChecklistUiError =>
  correlationId === undefined ? value : { ...value, correlationId };

function staleGroup(fields: readonly { field: string }[]): ChecklistGroupPath | null {
  for (const { field } of fields) {
    if (!field.startsWith(OTHER_GROUP)) continue;
    const group = field.slice(OTHER_GROUP.length);
    if ((CHECKLIST_GROUP_PATHS as readonly string[]).includes(group)) return group as ChecklistGroupPath;
  }
  return null;
}

/**
 * Maps a checklist call result to the page case of spec 6.3 by its `code` and field, never its message; null for a
 * success. Never throws. A 400 naming `correction` opens the correction box (`correction-required`, BR-22, A-29);
 * other 400 paths are `validation`; `VALIDATION_FAILED` without fields is the panel message (`form`). An unknown 409 is
 * `stale` (reload, drafts kept); an unknown 422, 429, 5xx and network are `retry`.
 */
export function toChecklistUiError(result: ApiResult<unknown>): ChecklistUiError | null {
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
      if (fieldErrors.length === 0 && code === "VALIDATION_FAILED") return withCorrelation({ kind: "form" }, correlationId);
      const fields = new Map<string, string>();
      for (const { field, message } of fieldErrors) {
        if (!fields.has(field)) fields.set(field, message);
      }
      const kind = fields.has("correction") ? "correction-required" : "validation";
      return withCorrelation({ kind, fieldErrors: Object.fromEntries(fields) }, correlationId);
    }
    case 403:
      return withCorrelation({ kind: "forbidden" }, correlationId);
    case 404:
      return withCorrelation({ kind: "not-found" }, correlationId);
    case 409: {
      if (code === "CHECKLIST_NOT_ALLOWED") {
        return withCorrelation({ kind: "not-allowed", notAllowedField: fieldErrors[0]?.field ?? null }, correlationId);
      }
      const known = code !== undefined && Object.hasOwn(CONFLICTS, code) ? CONFLICTS[code] : undefined;
      if (known !== undefined) return withCorrelation({ kind: known }, correlationId);
      return withCorrelation({ kind: "stale", staleGroup: staleGroup(fieldErrors) }, correlationId);
    }
    case 422:
      return withCorrelation({ kind: code === "SURVEYOR_INELIGIBLE" ? "surveyor-ineligible" : "retry" }, correlationId);
    default:
      return withCorrelation({ kind: "retry" }, correlationId);
  }
}
