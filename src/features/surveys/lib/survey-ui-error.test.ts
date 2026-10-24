import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import type { FieldError } from "@/lib/api";

import { toSurveyUiError } from "./survey-ui-error";

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

describe("toSurveyUiError (spec 6.7, 7.3: by code, never by message)", () => {
  it("returns null for a success", () => {
    expect(toSurveyUiError({ ok: true, data: {}, status: 200, replayed: false, correlationId: "c" })).toBeNull();
  });

  it("maps signed-out, unavailable and network as the lead pages", () => {
    expect(toSurveyUiError({ ok: false, kind: "signed-out" })).toEqual({ kind: "signed-out" });
    expect(toSurveyUiError({ ok: false, kind: "unavailable", retryAfterSeconds: 5 })).toEqual({ kind: "unavailable" });
    expect(toSurveyUiError({ ok: false, kind: "network" })).toEqual({ kind: "retry" });
    expect(toSurveyUiError(http(500, { correlationId: "c-5" }))).toEqual({ kind: "retry", correlationId: "c-5" });
    expect(toSurveyUiError(http(429))).toEqual({ kind: "retry" });
  });

  it("maps a 400 with fields to validation, first message per field", () => {
    const result = toSurveyUiError(
      http(400, {
        code: "VALIDATION_FAILED",
        correlationId: "c-4",
        fieldErrors: [
          { field: "startAt", message: "first" },
          { field: "startAt", message: "second" },
          { field: "meetingLocation.addressText", message: "address" },
        ],
      }),
    );
    expect(result).toEqual({
      kind: "validation",
      fieldErrors: { startAt: "first", "meetingLocation.addressText": "address" },
      correlationId: "c-4",
    });
  });

  it("maps a 400 without fields (Nothing changed.) to a form message", () => {
    expect(toSurveyUiError(http(400, { code: "VALIDATION_FAILED" }))).toEqual({ kind: "form" });
  });

  it("maps any other 400 without fields (a malformed body) to the general validation message, not Nothing changed.", () => {
    expect(toSurveyUiError(http(400, { code: "MALFORMED_REQUEST", correlationId: "c" }))).toEqual({
      kind: "validation",
      fieldErrors: {},
      correlationId: "c",
    });
    expect(toSurveyUiError(http(400))).toEqual({ kind: "validation", fieldErrors: {} });
  });

  it("maps 403 to forbidden and 404 to not-found", () => {
    expect(toSurveyUiError(http(403))).toEqual({ kind: "forbidden" });
    expect(toSurveyUiError(http(404, { code: "NOT_FOUND" }))).toEqual({ kind: "not-found" });
  });

  it("maps CONCURRENT_MODIFICATION on any version field to stale", () => {
    for (const field of ["expectedLeadVersion", "expectedAppointmentVersion", "expectedVersion"]) {
      expect(
        toSurveyUiError(http(409, { code: "CONCURRENT_MODIFICATION", fieldErrors: [{ field, message: "x" }] })),
      ).toEqual({ kind: "stale" });
    }
  });

  it("maps each survey 409 code to its own kind", () => {
    expect(toSurveyUiError(http(409, { code: "SURVEY_ALREADY_SCHEDULED" }))).toEqual({ kind: "already-scheduled" });
    expect(
      toSurveyUiError(http(409, { code: "SURVEY_NOT_ALLOWED", fieldErrors: [{ field: "status", message: "x" }] })),
    ).toEqual({ kind: "not-allowed" });
    expect(toSurveyUiError(http(409, { code: "NO_CURRENT_VISIT" }))).toEqual({ kind: "no-current-visit" });
    expect(
      toSurveyUiError(
        http(409, {
          code: "INVALID_STATE_TRANSITION",
          fieldErrors: [{ field: "status", message: "x", allowedValues: ["ON_HOLD"] }],
        }),
      ),
    ).toEqual({ kind: "invalid-transition" });
  });

  it("maps an unknown 409 to stale (reload)", () => {
    expect(toSurveyUiError(http(409, { code: "SOMETHING_ELSE" }))).toEqual({ kind: "stale" });
  });

  it("maps the 422 codes; an unknown 422 is retry", () => {
    expect(toSurveyUiError(http(422, { code: "SURVEYOR_INELIGIBLE" }))).toEqual({ kind: "surveyor-ineligible" });
    expect(
      toSurveyUiError(
        http(422, { code: "PERFORMER_MISMATCH", fieldErrors: [{ field: "performedByUserId", message: "x" }] }),
      ),
    ).toEqual({ kind: "performer-mismatch" });
    expect(toSurveyUiError(http(422, { code: "OTHER" }))).toEqual({ kind: "retry" });
  });

  it("never reads the message", () => {
    const withMessage = { ...http(409, { code: "NO_CURRENT_VISIT" }), message: "SURVEY_ALREADY_SCHEDULED" };
    expect(toSurveyUiError(withMessage as ApiResult<unknown>)).toEqual({ kind: "no-current-visit" });
  });
});
