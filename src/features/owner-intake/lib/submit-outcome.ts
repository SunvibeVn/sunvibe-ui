import type { components } from "@/api/generated/schema";
import type { PublicApiResult } from "@/lib/api";

import type { FieldErrorKinds, FieldName } from "../types/form";

import { FIELD_ORDER, fieldErrorMessage, fieldErrorMessages, GENERIC_ERROR_KEY, type FieldErrorMessage } from "./field-errors";

export type OwnerIntakeAccepted = components["schemas"]["OwnerIntakeResponse"];

export type FieldErrorMessages = Partial<Record<FieldName, FieldErrorMessage>>;

/** Banner message keys in the OwnerIntake namespace. */
export type SubmitMessageKey = "errors.generic" | "errors.network" | "errors.keyReused" | "errors.rateLimited";

/** What to do with the Idempotency-Key after this answer (handoff 2.3). */
export type KeyAction = "keep" | "renew" | "reset";

/** An answer that can only come from an FE bug; log it with the correlation id, never show it. */
export type SubmitBugLog = { status: number; code?: string; correlationId?: string; fields?: string[] };

export type SubmitOutcome =
  | { kind: "success"; requestCode: string; key: "reset" }
  | {
      kind: "error";
      /** Message per input; server field names are already moved onto the input that shows them. */
      fieldErrors: FieldErrorMessages;
      /** Banner above the submit button; none when the field messages say it all. */
      message?: SubmitMessageKey;
      /** Show a "send again" button; a retry of the same body reuses its key. */
      retryable: boolean;
      key: Exclude<KeyAction, "reset">;
      /** "Mã hỗ trợ" on a 5xx. */
      supportCode?: string;
      /** 429: keep the submit disabled this long (0 when Retry-After is missing). */
      retryAfterSeconds?: number;
      log?: SubmitBugLog;
    };

/** Server fields that no input carries: the input that shows their message. */
const FIELD_TARGET: Record<string, FieldName> = {
  askingPrice: "askingPrice.amount",
  "askingPrice.currency": "askingPrice.amount",
  "askingPrice.unit": "askingPrice.amount",
  consent: "consent.accepted",
};

/** Fields the owner cannot fix; an error on them is an FE bug (handoff section 4). */
const FE_BUG_FIELDS = new Set(["Idempotency-Key", "consent.noticeVersion"]);

function isFieldName(field: string): field is FieldName {
  return (FIELD_ORDER as readonly string[]).includes(field);
}

function error(outcome: Omit<Extract<SubmitOutcome, { kind: "error" }>, "kind" | "fieldErrors" | "retryable" | "key"> & {
  fieldErrors?: FieldErrorMessages;
  retryable?: boolean;
  key?: "keep" | "renew";
}): SubmitOutcome {
  return { kind: "error", fieldErrors: {}, retryable: false, key: "keep", ...outcome };
}

function bug(status: number, code: string | undefined, correlationId: string | undefined): SubmitBugLog {
  return { status, ...(code && { code }), ...(correlationId && { correlationId }) };
}

/** Client validation failed: per-field messages, no banner, no request. */
export function invalidOutcome(kinds: FieldErrorKinds, has: (key: string) => boolean): SubmitOutcome {
  return error({ fieldErrors: fieldErrorMessages(kinds, has) });
}

function validationOutcome(
  result: { status: number; code?: string; correlationId?: string; fieldErrors: { field: string }[] },
  has: (key: string) => boolean,
): SubmitOutcome {
  const fieldErrors: FieldErrorMessages = {};
  const bugFields: string[] = [];
  for (const { field } of result.fieldErrors) {
    const target = FIELD_TARGET[field] ?? (isFieldName(field) ? field : undefined);
    if (FE_BUG_FIELDS.has(field) || target === undefined) bugFields.push(field);
    // The server sends no kind; at most one entry per field, sorted by name, so the first one wins.
    else fieldErrors[target] ??= fieldErrorMessage(field, "invalid", has);
  }
  if (bugFields.length === 0 && Object.keys(fieldErrors).length > 0) return error({ fieldErrors });
  return error({
    fieldErrors,
    message: GENERIC_ERROR_KEY,
    log: { ...bug(result.status, result.code, result.correlationId), fields: bugFields },
  });
}

/** Maps the answer of POST /api/v1/public/owner-intake-requests to what the form shows (handoff section 4). */
export function toSubmitOutcome(
  result: PublicApiResult<OwnerIntakeAccepted>,
  has: (key: string) => boolean,
): SubmitOutcome {
  if (result.ok) {
    // A replay (Idempotent-Replayed: true) shows the same screen with the same code.
    const requestCode = result.data?.requestCode;
    if (requestCode) return { kind: "success", requestCode, key: "reset" };
    return error({ message: GENERIC_ERROR_KEY, log: bug(result.status, undefined, result.correlationId) });
  }
  if (result.kind === "network") return error({ message: "errors.network", retryable: true });

  const { status, code, correlationId } = result;
  if (status === 400 && code === "VALIDATION_FAILED") return validationOutcome(result, has);
  if (status === 409) return error({ message: "errors.keyReused", retryable: true, key: "renew" });
  if (status === 429) {
    const seconds = result.retryAfterSeconds;
    return error({
      message: "errors.rateLimited",
      retryAfterSeconds: seconds !== undefined && seconds > 0 ? Math.ceil(seconds) : 0,
    });
  }
  if (status >= 500) {
    return error({ message: GENERIC_ERROR_KEY, retryable: true, ...(correlationId && { supportCode: correlationId }) });
  }
  // 400 MALFORMED_REQUEST, 413, 415 and anything unexpected: nothing the owner can fix.
  return error({ message: GENERIC_ERROR_KEY, log: bug(status, code, correlationId) });
}
