import type { ApiResult } from "@/features/auth/client";

// What a failed survey photo call means for the page (survey-media spec 6.3, 6.2), by `code` and field, never the
// message. The checklist page turns each kind into its text and its uploader step.

export type MediaUiErrorKind =
  | "signed-out"
  | "unavailable"
  | "forbidden"
  | "not-found"
  | "read-only"
  | "takeover-required"
  | "stale"
  | "surveyor-ineligible"
  | "upload-disabled"
  | "intake-paused"
  | "limit-selected"
  /** MEDIA_LIMIT_REACHED field `pending`: the file waits in the queue. */
  | "limit-pending"
  /** RATE_LIMITED fields `records` and `bytes`: "Too many uploads. Try again in <n> minutes." */
  | "rate-uploads"
  /** RATE_LIMITED field `bodies`: the file waits in the queue. */
  | "rate-bodies"
  /** RATE_LIMITED field `expensive`: the queue holds for the hour. */
  | "rate-expensive"
  /** RATE_LIMITED field `concurrency` on a read: retried after `Retry-After` without a message. */
  | "rate-concurrency"
  /** RATE_LIMITED field `budget` on a read: "Too many photo views. Try again in <n> minutes." */
  | "rate-budget"
  | "serving-disabled"
  | "too-large"
  | "duplicate"
  | "other-visit"
  | "not-available"
  | "referenced"
  /** MEDIA_STORE_UNAVAILABLE, MEDIA_SERVER_BUSY: retried later, the queue kept. */
  | "busy"
  /** MEDIA_UPLOAD_EXPIRED, IDEMPOTENCY_KEY_REUSED: upload the photo again (a new photo). */
  | "upload-again"
  | "in-progress"
  /** MEDIA_CONTENT_ALREADY_RECEIVED: the bytes arrived earlier; the list says what became of them. */
  | "already-received"
  /** MALFORMED_REQUEST on the content PUT (length, digest, type): upload again from the file. */
  | "malformed"
  | "correction-required"
  | "validation"
  /** A network error on the content PUT: the uploader reads the list before it sends again (SM-22). */
  | "state-unknown"
  | "aborted"
  | "retry";

export type MediaUiError = {
  kind: MediaUiErrorKind;
  /** `Retry-After` of a 429 or 503, in seconds. */
  retryAfterSeconds?: number;
  /** `rate-uploads`, `rate-budget`: the wait in whole minutes (at least 1). */
  minutes?: number;
  /** `duplicate`, `other-visit`: the matching photo (`allowedValues[0]`), null when the server named none. */
  matchingMediaId?: string | null;
  /** `validation`, `correction-required`: JSON path -> the first server message (never shown as is). */
  fieldErrors?: Record<string, string>;
  correlationId?: string;
};

/** Which call failed: a network error means "state unknown" only on the content upload. */
export type MediaCallContext = "list" | "create" | "upload" | "image" | "remove" | "hold";

/** The two outcomes that are not an API answer: an aborted upload and an image that is not a JPEG. */
type LocalFailure = { ok: false; kind: "aborted" } | { ok: false; kind: "not-jpeg" };

const CONFLICTS: Readonly<Record<string, MediaUiErrorKind>> = {
  CHECKLIST_READ_ONLY: "read-only",
  CHECKLIST_TAKEOVER_REQUIRED: "takeover-required",
  MEDIA_UPLOAD_DISABLED: "upload-disabled",
  MEDIA_REFERENCED: "referenced",
  MEDIA_NOT_AVAILABLE: "not-available",
  MEDIA_UPLOAD_EXPIRED: "upload-again",
  IDEMPOTENCY_KEY_REUSED: "upload-again",
  MEDIA_UPLOAD_IN_PROGRESS: "in-progress",
  MEDIA_CONTENT_ALREADY_RECEIVED: "already-received",
};

const UNAVAILABLE: Readonly<Record<string, MediaUiErrorKind>> = {
  MEDIA_INTAKE_PAUSED: "intake-paused",
  MEDIA_SERVING_DISABLED: "serving-disabled",
  MEDIA_STORE_UNAVAILABLE: "busy",
  MEDIA_SERVER_BUSY: "busy",
};

const RATE_FIELDS: Readonly<Record<string, MediaUiErrorKind>> = {
  records: "rate-uploads",
  bytes: "rate-uploads",
  bodies: "rate-bodies",
  expensive: "rate-expensive",
  concurrency: "rate-concurrency",
  budget: "rate-budget",
};

const known = <T>(map: Readonly<Record<string, T>>, key: string | undefined): T | undefined =>
  key !== undefined && Object.hasOwn(map, key) ? map[key] : undefined;

const minutesOf = (seconds: number | undefined): number => Math.max(1, Math.ceil((seconds ?? 60) / 60));

/** Maps a photo call result to the case of spec 6.3; null for a success. Never throws. */
export function toMediaUiError(result: ApiResult<unknown> | LocalFailure, context: MediaCallContext): MediaUiError | null {
  if (result.ok) return null;
  switch (result.kind) {
    case "signed-out":
      return { kind: "signed-out" };
    case "unavailable":
      return { kind: "unavailable" };
    case "network":
      return { kind: context === "upload" ? "state-unknown" : "retry" };
    case "aborted":
      return { kind: "aborted" };
    case "not-jpeg":
      return { kind: "not-available" };
    case "http":
      break;
  }

  const { status, code, fieldErrors, correlationId, retryAfterSeconds } = result;
  const withMeta = (error: MediaUiError): MediaUiError => ({
    ...error,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    ...(correlationId === undefined ? {} : { correlationId }),
  });
  const fields = new Map<string, string>();
  for (const { field, message } of fieldErrors) if (!fields.has(field)) fields.set(field, message);
  const firstField = fieldErrors[0]?.field;

  switch (status) {
    case 400: {
      if (code === "MALFORMED_REQUEST") return withMeta({ kind: "malformed" });
      if (fields.has("correction")) return withMeta({ kind: "correction-required", fieldErrors: Object.fromEntries(fields) });
      if (fields.has("sizeBytes")) return withMeta({ kind: "too-large" });
      return withMeta({ kind: "validation", fieldErrors: Object.fromEntries(fields) });
    }
    case 403:
      return withMeta({ kind: "forbidden" });
    case 404:
      return withMeta({ kind: "not-found" });
    case 409: {
      if (code === "MEDIA_DUPLICATE_CONTENT" || code === "MEDIA_FROM_OTHER_VISIT") {
        const match = fieldErrors.find((entry) => entry.allowedValues !== undefined && entry.allowedValues.length > 0);
        return withMeta({
          kind: code === "MEDIA_DUPLICATE_CONTENT" ? "duplicate" : "other-visit",
          matchingMediaId: match?.allowedValues?.[0] ?? null,
        });
      }
      if (code === "MEDIA_LIMIT_REACHED") return withMeta({ kind: firstField === "pending" ? "limit-pending" : "limit-selected" });
      return withMeta({ kind: known(CONFLICTS, code) ?? "stale" });
    }
    case 413:
      return withMeta({ kind: "too-large" });
    case 415:
      return withMeta({ kind: "malformed" });
    case 422:
      return withMeta({ kind: code === "SURVEYOR_INELIGIBLE" ? "surveyor-ineligible" : "retry" });
    case 429: {
      const kind = known(RATE_FIELDS, firstField) ?? "retry";
      if (kind === "rate-uploads" || kind === "rate-budget") return withMeta({ kind, minutes: minutesOf(retryAfterSeconds) });
      return withMeta({ kind });
    }
    case 503:
      return withMeta({ kind: known(UNAVAILABLE, code) ?? "retry" });
    default:
      return withMeta({ kind: "retry" });
  }
}
