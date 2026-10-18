import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import type { FieldError } from "@/lib/api";

import { toLeadUiError } from "./lead-ui-error";

const http = (
  status: number,
  extras: { code?: string; fieldErrors?: FieldError[]; correlationId?: string } = {},
): ApiResult<unknown> => ({
  ok: false,
  kind: "http",
  status,
  code: extras.code,
  fieldErrors: extras.fieldErrors ?? [],
  correlationId: extras.correlationId,
});

describe("toLeadUiError (spec 5.2)", () => {
  it("returns null for a success", () => {
    expect(toLeadUiError({ ok: true, data: {}, status: 200, replayed: false, correlationId: "c-1" })).toBeNull();
  });

  it("maps signed-out and unavailable to the session states", () => {
    expect(toLeadUiError({ ok: false, kind: "signed-out" })).toEqual({ kind: "signed-out" });
    expect(toLeadUiError({ ok: false, kind: "unavailable" })).toEqual({ kind: "unavailable" });
    expect(toLeadUiError({ ok: false, kind: "unavailable", retryAfterSeconds: 30 })).toEqual({ kind: "unavailable" });
  });

  it("maps a network error, 500, 503 and 429 to retry", () => {
    expect(toLeadUiError({ ok: false, kind: "network" })).toEqual({ kind: "retry" });
    expect(toLeadUiError(http(500, { code: "INTERNAL_ERROR", correlationId: "c-500" }))).toEqual({
      kind: "retry",
      correlationId: "c-500",
    });
    expect(toLeadUiError(http(503))).toEqual({ kind: "retry" });
    expect(toLeadUiError(http(429, { correlationId: "c-429" }))).toEqual({ kind: "retry", correlationId: "c-429" });
  });

  it("maps 403 to forbidden and 404 to not-found", () => {
    expect(toLeadUiError(http(403, { correlationId: "c-403" }))).toEqual({ kind: "forbidden", correlationId: "c-403" });
    expect(toLeadUiError(http(404, { correlationId: "c-404" }))).toEqual({ kind: "not-found", correlationId: "c-404" });
  });

  it("maps 409 INVALID_STATE_TRANSITION with allowedValues to invalid-transition, keeping only W9 statuses", () => {
    const result = http(409, {
      code: "INVALID_STATE_TRANSITION",
      correlationId: "c-409",
      fieldErrors: [
        {
          field: "toStatus",
          message: "not allowed",
          allowedValues: ["ON_HOLD", "VALIDATING", "REJECTED", "ON_HOLD", "bogus"],
        },
      ],
    });
    expect(toLeadUiError(result)).toEqual({
      kind: "invalid-transition",
      allowed: ["ON_HOLD", "REJECTED"],
      correlationId: "c-409",
    });
  });

  it("maps 409 INVALID_STATE_TRANSITION without allowedValues (a note on a closed lead) to invalid-transition", () => {
    expect(toLeadUiError(http(409, { code: "INVALID_STATE_TRANSITION" }))).toEqual({ kind: "invalid-transition" });
    const onlyLater = http(409, {
      code: "INVALID_STATE_TRANSITION",
      fieldErrors: [{ field: "toStatus", message: "x", allowedValues: ["QUALIFIED"] }],
    });
    expect(toLeadUiError(onlyLater)).toEqual({ kind: "invalid-transition" });
  });

  it("maps 409 CONCURRENT_MODIFICATION with and without a field to stale (W11-35)", () => {
    expect(toLeadUiError(http(409, { code: "CONCURRENT_MODIFICATION", correlationId: "c-s" }))).toEqual({
      kind: "stale",
      correlationId: "c-s",
    });
    const withField = http(409, {
      code: "CONCURRENT_MODIFICATION",
      fieldErrors: [{ field: "expectedVersion", message: "stale" }],
    });
    expect(toLeadUiError(withField)).toEqual({ kind: "stale" });
  });

  it("maps a 409 with another or no code to stale (reload)", () => {
    expect(toLeadUiError(http(409))).toEqual({ kind: "stale" });
    expect(toLeadUiError(http(409, { code: "SOMETHING_NEW" }))).toEqual({ kind: "stale" });
  });

  it("maps 422 to ineligible", () => {
    expect(toLeadUiError(http(422, { code: "INELIGIBLE_ASSIGNEE", correlationId: "c-422" }))).toEqual({
      kind: "ineligible",
      correlationId: "c-422",
    });
  });

  it("maps 400 to validation with a field -> message map (first message per field wins)", () => {
    const result = http(400, {
      code: "VALIDATION_FAILED",
      correlationId: "c-400",
      fieldErrors: [
        { field: "note", message: "must not be blank" },
        { field: "note", message: "size must be between 1 and 2000" },
        { field: "nextActionAt", message: "must be in the future" },
      ],
    });
    expect(toLeadUiError(result)).toEqual({
      kind: "validation",
      fieldErrors: { note: "must not be blank", nextActionAt: "must be in the future" },
      correlationId: "c-400",
    });
  });

  it("maps a 400 without field errors to validation with an empty map (general message)", () => {
    expect(toLeadUiError(http(400))).toEqual({ kind: "validation", fieldErrors: {} });
  });

  it("maps any other status to retry", () => {
    expect(toLeadUiError(http(401))).toEqual({ kind: "retry" });
    expect(toLeadUiError(http(413, { correlationId: "c-413" }))).toEqual({ kind: "retry", correlationId: "c-413" });
  });
});
