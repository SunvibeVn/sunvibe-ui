import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import { toMediaUiError } from "./media-ui-error";

type FieldError = { field: string; message: string; allowedValues?: string[] };

const http = (status: number, code?: string, fields: FieldError[] = [], retryAfterSeconds?: number): ApiResult<never> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: fields,
  correlationId: "c-1",
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
});
const field = (name: string, allowedValues?: string[]): FieldError =>
  allowedValues ? { field: name, message: "x", allowedValues } : { field: name, message: "x" };

describe("toMediaUiError (survey-media spec 6.3, by code and field)", () => {
  it("is null for a success", () => {
    expect(toMediaUiError({ ok: true, data: {}, status: 200, replayed: false }, "list")).toBeNull();
  });

  it("maps the session and network outcomes; a network error on the content PUT is state unknown", () => {
    expect(toMediaUiError({ ok: false, kind: "signed-out" }, "list")).toEqual({ kind: "signed-out" });
    expect(toMediaUiError({ ok: false, kind: "unavailable" }, "create")).toEqual({ kind: "unavailable" });
    expect(toMediaUiError({ ok: false, kind: "network" }, "upload")).toEqual({ kind: "state-unknown" });
    expect(toMediaUiError({ ok: false, kind: "network" }, "create")).toEqual({ kind: "retry" });
    expect(toMediaUiError({ ok: false, kind: "aborted" }, "upload")).toEqual({ kind: "aborted" });
    expect(toMediaUiError({ ok: false, kind: "not-jpeg" }, "image")).toEqual({ kind: "not-available" });
  });

  it("MEDIA_UPLOAD_DISABLED", () => {
    expect(toMediaUiError(http(409, "MEDIA_UPLOAD_DISABLED"), "create")).toMatchObject({ kind: "upload-disabled" });
  });

  it("MEDIA_INTAKE_PAUSED holds the queue until Retry-After", () => {
    expect(toMediaUiError(http(503, "MEDIA_INTAKE_PAUSED", [], 120), "create")).toMatchObject({
      kind: "intake-paused",
      retryAfterSeconds: 120,
    });
  });

  it("MEDIA_LIMIT_REACHED: field selected fails, field pending queues", () => {
    expect(toMediaUiError(http(409, "MEDIA_LIMIT_REACHED", [field("selected")]), "create")).toMatchObject({
      kind: "limit-selected",
    });
    expect(toMediaUiError(http(409, "MEDIA_LIMIT_REACHED", [field("pending")]), "create")).toMatchObject({
      kind: "limit-pending",
    });
  });

  it("RATE_LIMITED by field: records and bytes in minutes, bodies queues, expensive holds, concurrency silent, budget", () => {
    expect(toMediaUiError(http(429, "RATE_LIMITED", [field("records")], 600), "create")).toMatchObject({
      kind: "rate-uploads",
      minutes: 10,
      retryAfterSeconds: 600,
    });
    expect(toMediaUiError(http(429, "RATE_LIMITED", [field("bytes")], 61), "create")).toMatchObject({
      kind: "rate-uploads",
      minutes: 2,
    });
    expect(toMediaUiError(http(429, "RATE_LIMITED", [field("bodies")], 5), "upload")).toMatchObject({
      kind: "rate-bodies",
      retryAfterSeconds: 5,
    });
    expect(toMediaUiError(http(429, "RATE_LIMITED", [field("expensive")], 3600), "upload")).toMatchObject({
      kind: "rate-expensive",
      retryAfterSeconds: 3600,
    });
    expect(toMediaUiError(http(429, "RATE_LIMITED", [field("concurrency")], 2), "image")).toMatchObject({
      kind: "rate-concurrency",
      retryAfterSeconds: 2,
    });
    expect(toMediaUiError(http(429, "RATE_LIMITED", [field("budget")], 1800), "image")).toMatchObject({
      kind: "rate-budget",
      minutes: 30,
    });
    expect(toMediaUiError(http(429, "RATE_LIMITED", [field("budget")]), "list")).toMatchObject({
      kind: "rate-budget",
      minutes: 1,
    });
  });

  it("MEDIA_SERVING_DISABLED", () => {
    expect(toMediaUiError(http(503, "MEDIA_SERVING_DISABLED", [], 60), "image")).toMatchObject({
      kind: "serving-disabled",
      retryAfterSeconds: 60,
    });
  });

  it("PAYLOAD_TOO_LARGE and a 400 on sizeBytes are 'larger than 20 MB'", () => {
    expect(toMediaUiError(http(413, "PAYLOAD_TOO_LARGE"), "upload")).toMatchObject({ kind: "too-large" });
    expect(toMediaUiError(http(400, "VALIDATION_FAILED", [field("sizeBytes")]), "create")).toMatchObject({
      kind: "too-large",
    });
  });

  it("MEDIA_DUPLICATE_CONTENT and MEDIA_FROM_OTHER_VISIT carry the matching photo id", () => {
    expect(
      toMediaUiError(http(409, "MEDIA_DUPLICATE_CONTENT", [field("contentSha256", ["M7"])]), "create"),
    ).toMatchObject({ kind: "duplicate", matchingMediaId: "M7" });
    expect(
      toMediaUiError(http(409, "MEDIA_FROM_OTHER_VISIT", [field("contentSha256", ["M3"])]), "create"),
    ).toMatchObject({ kind: "other-visit", matchingMediaId: "M3" });
    expect(toMediaUiError(http(409, "MEDIA_DUPLICATE_CONTENT"), "create")).toMatchObject({
      kind: "duplicate",
      matchingMediaId: null,
    });
  });

  it("MEDIA_NOT_AVAILABLE (image not shown) by field", () => {
    expect(toMediaUiError(http(409, "MEDIA_NOT_AVAILABLE", [field("status")]), "image")).toMatchObject({
      kind: "not-available",
    });
    expect(toMediaUiError(http(409, "MEDIA_NOT_AVAILABLE", [field("uploadedBy")]), "upload")).toMatchObject({
      kind: "not-available",
    });
  });

  it("MEDIA_REFERENCED cannot be removed", () => {
    expect(toMediaUiError(http(409, "MEDIA_REFERENCED"), "remove")).toMatchObject({ kind: "referenced" });
  });

  it("MEDIA_STORE_UNAVAILABLE and MEDIA_SERVER_BUSY retry later with the queue kept", () => {
    expect(toMediaUiError(http(503, "MEDIA_STORE_UNAVAILABLE"), "upload")).toMatchObject({ kind: "busy" });
    expect(toMediaUiError(http(503, "MEDIA_SERVER_BUSY", [], 10), "image")).toMatchObject({
      kind: "busy",
      retryAfterSeconds: 10,
    });
  });

  it("MEDIA_UPLOAD_EXPIRED and IDEMPOTENCY_KEY_REUSED: upload again; MEDIA_UPLOAD_IN_PROGRESS: wait", () => {
    expect(toMediaUiError(http(409, "MEDIA_UPLOAD_EXPIRED"), "upload")).toMatchObject({ kind: "upload-again" });
    expect(toMediaUiError(http(409, "IDEMPOTENCY_KEY_REUSED", [field("uploadKey")]), "create")).toMatchObject({
      kind: "upload-again",
    });
    expect(toMediaUiError(http(409, "MEDIA_UPLOAD_IN_PROGRESS"), "upload")).toMatchObject({ kind: "in-progress" });
    expect(toMediaUiError(http(409, "MEDIA_CONTENT_ALREADY_RECEIVED"), "upload")).toMatchObject({
      kind: "already-received",
    });
  });

  it("MALFORMED_REQUEST (length or digest) and 415: upload again from the file", () => {
    expect(toMediaUiError(http(400, "MALFORMED_REQUEST", [field("Content-Digest")]), "upload")).toMatchObject({
      kind: "malformed",
    });
    expect(toMediaUiError(http(415, "MALFORMED_REQUEST", [field("Content-Type")]), "upload")).toMatchObject({
      kind: "malformed",
    });
  });

  it("checklist codes as W16: read-only, takeover required, 403, 404, 422, correction", () => {
    expect(toMediaUiError(http(409, "CHECKLIST_READ_ONLY"), "create")).toMatchObject({ kind: "read-only" });
    expect(toMediaUiError(http(409, "CHECKLIST_TAKEOVER_REQUIRED"), "upload")).toMatchObject({
      kind: "takeover-required",
    });
    expect(toMediaUiError(http(409, "CONCURRENT_MODIFICATION"), "remove")).toMatchObject({ kind: "stale" });
    expect(toMediaUiError(http(403), "list")).toMatchObject({ kind: "forbidden" });
    expect(toMediaUiError(http(404, "NOT_FOUND"), "image")).toMatchObject({ kind: "not-found" });
    expect(toMediaUiError(http(422, "SURVEYOR_INELIGIBLE"), "create")).toMatchObject({ kind: "surveyor-ineligible" });
    expect(
      toMediaUiError(http(400, "VALIDATION_FAILED", [field("correction"), field("correction.reason")]), "remove"),
    ).toMatchObject({ kind: "correction-required", fieldErrors: { correction: "x", "correction.reason": "x" } });
    expect(toMediaUiError(http(400, "VALIDATION_FAILED", [field("caption")]), "create")).toMatchObject({
      kind: "validation",
      fieldErrors: { caption: "x" },
    });
  });

  it("anything else retries, keeping the correlation id", () => {
    expect(toMediaUiError(http(500), "list")).toEqual({ kind: "retry", correlationId: "c-1" });
    expect(toMediaUiError(http(409, "SOMETHING_NEW"), "create")).toMatchObject({ kind: "stale" });
  });
});
