import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import type { FieldError } from "@/lib/api";

import { decisionRules, submitGates, toChecklistUiError } from "./checklist-ui-error";

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

describe("submission and review codes (survey-checklist submission spec 7.3)", () => {
  it("error_notReady_mapsEachField: one gate per failing field, in the order of the answer", () => {
    expect(
      toChecklistUiError(
        http(409, {
          code: "CHECKLIST_NOT_READY",
          fieldErrors: [
            field("appointment"),
            field("readiness.missing"),
            field("media.pending"),
            field("media.limit"),
            field("media.unavailable"),
          ],
          correlationId: "c-g",
        }),
      ),
    ).toEqual({
      kind: "not-ready",
      gates: ["APPOINTMENT_SCHEDULED", "MISSING_ITEMS", "PHOTOS_NOT_FINISHED", "PHOTO_LIMIT", "PHOTO_UNAVAILABLE"],
      correlationId: "c-g",
    });
  });

  it("drops a field of CHECKLIST_NOT_READY this UI does not know", () => {
    expect(toChecklistUiError(http(409, { code: "CHECKLIST_NOT_READY", fieldErrors: [field("other")] }))).toEqual({
      kind: "not-ready",
      gates: [],
    });
  });

  it("maps 409 CHECKLIST_SUBMISSION_NOT_AVAILABLE", () => {
    expect(
      toChecklistUiError(http(409, { code: "CHECKLIST_SUBMISSION_NOT_AVAILABLE", fieldErrors: [field("submission")] })),
    ).toEqual({ kind: "submission-not-available" });
  });

  it("error_decisionNotAllowed_mapsHazards: the rules that refused, by field", () => {
    expect(
      toChecklistUiError(
        http(409, {
          code: "CHECKLIST_DECISION_NOT_ALLOWED",
          fieldErrors: [field("hazards"), field("evidence.rejected")],
          correlationId: "c-d",
        }),
      ),
    ).toEqual({ kind: "decision-not-allowed", rules: ["HAZARDS", "EVIDENCE_REJECTED"], correlationId: "c-d" });
  });

  it("names every field of CHECKLIST_DECISION_NOT_ALLOWED", () => {
    expect(
      decisionRules([
        "status",
        "lead.status",
        "lead.intentCycle",
        "visit",
        "media.serving",
        "hazards",
        "evidence.rejected",
        "evidence.unavailable",
        "appointment",
        "evidence.coverage",
      ]),
    ).toEqual([
      "STATUS",
      "LEAD_STATUS",
      "LEAD_INTENT_CYCLE",
      "VISIT",
      "MEDIA_SERVING",
      "HAZARDS",
      "EVIDENCE_REJECTED",
      "EVIDENCE_UNAVAILABLE",
      "APPOINTMENT",
      "EVIDENCE_COVERAGE",
    ]);
  });

  it("leaves out a rule field this UI does not know, and never reads an inherited key", () => {
    expect(decisionRules(["hazards", "other", "toString"])).toEqual(["HAZARDS"]);
    expect(submitGates(["toString", "media.limit"])).toEqual(["PHOTO_LIMIT"]);
  });

  it("error_reviewNotAllowed: 403 CHECKLIST_REVIEW_NOT_ALLOWED says why, another 403 stays forbidden", () => {
    expect(
      toChecklistUiError(
        http(403, { code: "CHECKLIST_REVIEW_NOT_ALLOWED", fieldErrors: [field("reviewer")], correlationId: "c-r" }),
      ),
    ).toEqual({ kind: "review-not-allowed", correlationId: "c-r" });
    expect(toChecklistUiError(http(403, { code: "ACCESS_DENIED" }))).toEqual({ kind: "forbidden" });
  });
});

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
