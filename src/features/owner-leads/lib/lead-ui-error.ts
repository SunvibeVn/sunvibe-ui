import type { ApiResult } from "@/features/auth/client";

import { isLeadStatus, type LeadStatus } from "../types";

/** What a failed staff call means for the workspace UI (spec 5.2). */
export type LeadUiErrorKind =
  | "signed-out"
  | "unavailable"
  | "forbidden"
  | "not-found"
  | "invalid-transition"
  | "stale"
  | "ineligible"
  | "validation"
  | "retry";

export type LeadUiError = {
  kind: LeadUiErrorKind;
  /** `invalid-transition` only: the W9 statuses the API allows now, when it named any. */
  allowed?: LeadStatus[];
  /**
   * `validation` only (always set there, possibly empty): API field name -> the first server message for that field.
   * The UI shows its own Vietnamese text per field and a general message when the map is empty.
   */
  fieldErrors?: Record<string, string>;
  /** Shown in small text under every message when present (ADR-010). */
  correlationId?: string;
};

/** `value` with `correlationId` added when there is one (never an `undefined` property). */
export const withCorrelation = <T extends object>(value: T, correlationId: string | undefined): T =>
  correlationId === undefined ? value : { ...value, correlationId };

/**
 * Maps a staff call result to the UI case of spec 5.2; null for a success. Never throws.
 * - 409 `INVALID_STATE_TRANSITION` -> `invalid-transition` (`allowed` from `errors[].allowedValues`, narrowed to W9
 *   statuses); any other 409 (`CONCURRENT_MODIFICATION` with or without a field, or an unknown code) -> `stale`
 *   (reload, draft kept).
 * - 422 -> `ineligible`; 400 -> `validation`; 403 -> `forbidden`; 404 -> `not-found`.
 * - `network`, 429, 5xx and any other status -> `retry`.
 */
export function toLeadUiError(result: ApiResult<unknown>): LeadUiError | null {
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
      // First message per field wins; Object.fromEntries defines own properties, so no field name reaches a prototype.
      const fields = new Map<string, string>();
      for (const { field, message } of fieldErrors) {
        if (!fields.has(field)) fields.set(field, message);
      }
      return withCorrelation<LeadUiError>({ kind: "validation", fieldErrors: Object.fromEntries(fields) }, correlationId);
    }
    case 403:
      return withCorrelation<LeadUiError>({ kind: "forbidden" }, correlationId);
    case 404:
      return withCorrelation<LeadUiError>({ kind: "not-found" }, correlationId);
    case 409: {
      if (code !== "INVALID_STATE_TRANSITION") return withCorrelation<LeadUiError>({ kind: "stale" }, correlationId);
      const allowed = [
        ...new Set(fieldErrors.flatMap((entry) => entry.allowedValues ?? []).filter(isLeadStatus)),
      ];
      return withCorrelation<LeadUiError>(
        allowed.length > 0 ? { kind: "invalid-transition", allowed } : { kind: "invalid-transition" },
        correlationId,
      );
    }
    case 422:
      return withCorrelation<LeadUiError>({ kind: "ineligible" }, correlationId);
    default:
      return withCorrelation<LeadUiError>({ kind: "retry" }, correlationId);
  }
}
