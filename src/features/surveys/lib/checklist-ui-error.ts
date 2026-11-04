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
  /** 409 CHECKLIST_SUBMISSION_NOT_AVAILABLE: uploads or submission are off. */
  | "submission-not-available"
  /** 409 CHECKLIST_NOT_READY: `gates` names each failing gate. */
  | "not-ready"
  /** 403 CHECKLIST_REVIEW_NOT_ALLOWED: the caller is outside the reviewers of this revision. */
  | "review-not-allowed"
  /** 409 CHECKLIST_DECISION_NOT_ALLOWED: `rules` names each rule that refused. */
  | "decision-not-allowed"
  | "retry";

/** A failing gate of a submit (spec 4.4), with the names of `readiness.submissionUnavailableReason`. */
export type ChecklistSubmitGate =
  | "APPOINTMENT_SCHEDULED"
  | "MISSING_ITEMS"
  | "PHOTOS_NOT_FINISHED"
  | "PHOTO_LIMIT"
  | "PHOTO_UNAVAILABLE";

/** A rule that refuses a decision (spec 4.5, 7.3); also the entries of `review.decisionBlockedBy`. */
export type ChecklistDecisionRule =
  | "STATUS"
  | "LEAD_STATUS"
  | "LEAD_INTENT_CYCLE"
  | "VISIT"
  | "MEDIA_SERVING"
  | "HAZARDS"
  | "EVIDENCE_REJECTED"
  | "EVIDENCE_UNAVAILABLE"
  | "APPOINTMENT"
  | "EVIDENCE_COVERAGE";

export type ChecklistUiError = {
  kind: ChecklistUiErrorKind;
  /** `validation`, `correction-required`: JSON path -> the first server message for it (never shown as is). */
  fieldErrors?: Record<string, string>;
  /** `stale`: the other group whose version was stale (`otherGroupVersions.<group>`), null for the saved group. */
  staleGroup?: ChecklistGroupPath | null;
  /** `not-allowed`: the field of CHECKLIST_NOT_ALLOWED (`appointmentId`, `intent`, `status`, `holder`), or null. */
  notAllowedField?: string | null;
  /** `not-ready`: the failing gates, in the order of the answer. */
  gates?: ChecklistSubmitGate[];
  /** `decision-not-allowed`: the rules that refused, in the order of the answer. */
  rules?: ChecklistDecisionRule[];
  /** Shown in small text under every message when present (ADR-010). */
  correlationId?: string;
};

const CONFLICTS: Record<string, ChecklistUiErrorKind> = {
  CHECKLIST_READ_ONLY: "read-only",
  CHECKLIST_TAKEOVER_REQUIRED: "takeover-required",
  CHECKLIST_ALREADY_STARTED: "already-started",
  CHECKLIST_SUBMISSION_NOT_AVAILABLE: "submission-not-available",
};

const SUBMIT_GATES: Readonly<Record<string, ChecklistSubmitGate>> = {
  appointment: "APPOINTMENT_SCHEDULED",
  "readiness.missing": "MISSING_ITEMS",
  "media.pending": "PHOTOS_NOT_FINISHED",
  "media.limit": "PHOTO_LIMIT",
  "media.unavailable": "PHOTO_UNAVAILABLE",
};

const DECISION_RULES: Readonly<Record<string, ChecklistDecisionRule>> = {
  status: "STATUS",
  "lead.status": "LEAD_STATUS",
  "lead.intentCycle": "LEAD_INTENT_CYCLE",
  visit: "VISIT",
  "media.serving": "MEDIA_SERVING",
  hazards: "HAZARDS",
  "evidence.rejected": "EVIDENCE_REJECTED",
  "evidence.unavailable": "EVIDENCE_UNAVAILABLE",
  appointment: "APPOINTMENT",
  "evidence.coverage": "EVIDENCE_COVERAGE",
};

const known = <T>(table: Readonly<Record<string, T>>, fields: readonly string[]): T[] =>
  fields.filter((field) => Object.hasOwn(table, field)).map((field) => table[field]);

/** The gates a CHECKLIST_NOT_READY names by `errors[].field`; a field this UI does not know is left out. */
export function submitGates(fields: readonly string[]): ChecklistSubmitGate[] {
  return known(SUBMIT_GATES, fields);
}

/** The rules a CHECKLIST_DECISION_NOT_ALLOWED or `review.decisionBlockedBy` names; an unknown field is left out. */
export function decisionRules(fields: readonly string[]): ChecklistDecisionRule[] {
  return known(DECISION_RULES, fields);
}

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
      return withCorrelation({ kind: code === "CHECKLIST_REVIEW_NOT_ALLOWED" ? "review-not-allowed" : "forbidden" }, correlationId);
    case 404:
      return withCorrelation({ kind: "not-found" }, correlationId);
    case 409: {
      if (code === "CHECKLIST_NOT_ALLOWED") {
        return withCorrelation({ kind: "not-allowed", notAllowedField: fieldErrors[0]?.field ?? null }, correlationId);
      }
      const names = fieldErrors.map((entry) => entry.field);
      if (code === "CHECKLIST_NOT_READY") return withCorrelation({ kind: "not-ready", gates: submitGates(names) }, correlationId);
      if (code === "CHECKLIST_DECISION_NOT_ALLOWED") {
        return withCorrelation({ kind: "decision-not-allowed", rules: decisionRules(names) }, correlationId);
      }
      const conflict = code !== undefined && Object.hasOwn(CONFLICTS, code) ? CONFLICTS[code] : undefined;
      if (conflict !== undefined) return withCorrelation({ kind: conflict }, correlationId);
      return withCorrelation({ kind: "stale", staleGroup: staleGroup(fieldErrors) }, correlationId);
    }
    case 422:
      return withCorrelation({ kind: code === "SURVEYOR_INELIGIBLE" ? "surveyor-ineligible" : "retry" }, correlationId);
    default:
      return withCorrelation({ kind: "retry" }, correlationId);
  }
}
