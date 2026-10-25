import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import type { FieldError } from "@/lib/api";

import { toChecklistUiError } from "./checklist-ui-error";

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

const field = (name: string, message = "server text", allowedValues?: string[]): FieldError =>
  allowedValues === undefined ? { field: name, message } : { field: name, message, allowedValues };

describe("toChecklistUiError (survey-checklist spec 6.3, 7.3: by code and field, never by message)", () => {
  it("returns null for a success", () => {
    expect(toChecklistUiError({ ok: true, data: {}, status: 200, replayed: false, correlationId: "c" })).toBeNull();
  });

  it("maps signed-out, unavailable, network, 5xx and 429 as the lead pages", () => {
    expect(toChecklistUiError({ ok: false, kind: "signed-out" })).toEqual({ kind: "signed-out" });
    expect(toChecklistUiError({ ok: false, kind: "unavailable", retryAfterSeconds: 5 })).toEqual({ kind: "unavailable" });
    expect(toChecklistUiError({ ok: false, kind: "network" })).toEqual({ kind: "retry" });
    expect(toChecklistUiError(http(500, { correlationId: "c-5" }))).toEqual({ kind: "retry", correlationId: "c-5" });
    expect(toChecklistUiError(http(429))).toEqual({ kind: "retry" });
  });

  it("maps a 400 with JSON paths to validation, first message per path", () => {
    expect(
      toChecklistUiError(
        http(400, {
          code: "VALIDATION_FAILED",
          correlationId: "c-4",
          fieldErrors: [
            field("content.spaces.1.code", "first"),
            field("content.spaces.1.code", "second"),
            field("content.spaces.0.monthlyRent.relayBasis"),
          ],
        }),
      ),
    ).toEqual({
      kind: "validation",
      fieldErrors: { "content.spaces.1.code": "first", "content.spaces.0.monthlyRent.relayBasis": "server text" },
      correlationId: "c-4",
    });
  });

  it("opens the correction box on a 400 that names correction, keeping the other fields", () => {
    expect(toChecklistUiError(http(400, { code: "VALIDATION_FAILED", fieldErrors: [field("correction")] }))).toEqual({
      kind: "correction-required",
      fieldErrors: { correction: "server text" },
    });
    expect(
      toChecklistUiError(
        http(400, { code: "VALIDATION_FAILED", fieldErrors: [field("content.egress.value"), field("correction")] }),
      ),
    ).toEqual({
      kind: "correction-required",
      fieldErrors: { "content.egress.value": "server text", correction: "server text" },
    });
  });

  it("keeps a 400 on a correction member as validation (the box is open and shows it)", () => {
    expect(
      toChecklistUiError(http(400, { code: "VALIDATION_FAILED", fieldErrors: [field("correction.basis.confirmedOn")] })),
    ).toEqual({ kind: "validation", fieldErrors: { "correction.basis.confirmedOn": "server text" } });
  });

  it("maps a 400 without fields to the panel message (form)", () => {
    expect(toChecklistUiError(http(400, { code: "VALIDATION_FAILED" }))).toEqual({ kind: "form" });
    expect(toChecklistUiError(http(400, { code: "MALFORMED" }))).toEqual({ kind: "validation", fieldErrors: {} });
  });

  it("maps 403 to forbidden and 404 to not-found", () => {
    expect(toChecklistUiError(http(403))).toEqual({ kind: "forbidden" });
    expect(toChecklistUiError(http(404, { code: "NOT_FOUND" }))).toEqual({ kind: "not-found" });
  });

  it("maps a stale group version and names the group", () => {
    expect(
      toChecklistUiError(http(409, { code: "CONCURRENT_MODIFICATION", fieldErrors: [field("expectedVersion")] })),
    ).toEqual({ kind: "stale", staleGroup: null });
    expect(
      toChecklistUiError(
        http(409, { code: "CONCURRENT_MODIFICATION", fieldErrors: [field("otherGroupVersions.terms")] }),
      ),
    ).toEqual({ kind: "stale", staleGroup: "terms" });
    expect(
      toChecklistUiError(
        http(409, { code: "CONCURRENT_MODIFICATION", fieldErrors: [field("otherGroupVersions.unknown")] }),
      ),
    ).toEqual({ kind: "stale", staleGroup: null });
  });

  it("maps the checklist conflicts by code", () => {
    expect(toChecklistUiError(http(409, { code: "CHECKLIST_READ_ONLY" }))).toEqual({ kind: "read-only" });
    expect(toChecklistUiError(http(409, { code: "CHECKLIST_TAKEOVER_REQUIRED" }))).toEqual({ kind: "takeover-required" });
    expect(toChecklistUiError(http(409, { code: "CHECKLIST_ALREADY_STARTED" }))).toEqual({ kind: "already-started" });
  });

  it("maps CHECKLIST_NOT_ALLOWED with the field it names", () => {
    for (const name of ["appointmentId", "intent", "status", "holder"]) {
      expect(
        toChecklistUiError(http(409, { code: "CHECKLIST_NOT_ALLOWED", fieldErrors: [field(name, "x", ["A"])] })),
      ).toEqual({ kind: "not-allowed", notAllowedField: name });
    }
    expect(toChecklistUiError(http(409, { code: "CHECKLIST_NOT_ALLOWED" }))).toEqual({
      kind: "not-allowed",
      notAllowedField: null,
    });
  });

  it("maps an unknown 409 to stale (reload, drafts kept)", () => {
    expect(toChecklistUiError(http(409, { code: "SOMETHING_NEW" }))).toEqual({ kind: "stale", staleGroup: null });
  });

  it("maps 422 SURVEYOR_INELIGIBLE, any other 422 to retry", () => {
    expect(toChecklistUiError(http(422, { code: "SURVEYOR_INELIGIBLE" }))).toEqual({ kind: "surveyor-ineligible" });
    expect(toChecklistUiError(http(422, { code: "OTHER" }))).toEqual({ kind: "retry" });
  });

  it("never reads the message: the same code with another message maps the same", () => {
    const a = toChecklistUiError(http(409, { code: "CHECKLIST_READ_ONLY", fieldErrors: [field("x", "one")] }));
    const b = toChecklistUiError(http(409, { code: "CHECKLIST_READ_ONLY", fieldErrors: [field("x", "two")] }));
    expect(a).toEqual(b);
  });
});
