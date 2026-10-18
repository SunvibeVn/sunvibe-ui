import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import type { FieldError } from "@/lib/api";

import type { LeadSummary } from "../types";

import { failureMessage, toCommandOutcome } from "./command-flow";

const http = (
  status: number,
  code?: string,
  fieldErrors: FieldError[] = [],
  correlationId?: string,
): ApiResult<LeadSummary> => ({ ok: false, kind: "http", status, code, fieldErrors, correlationId });

describe("toCommandOutcome (spec 5.2, assign and status change)", () => {
  it("takes the summary of a 2xx", () => {
    const summary: LeadSummary = { id: "L1", status: "CONTACTED", version: 4 };
    expect(toCommandOutcome({ ok: true, data: summary, status: 200, replayed: false })).toEqual({
      kind: "saved",
      summary,
    });
  });

  it("maps 409 CONCURRENT_MODIFICATION, with or without a field, to stale (W11-35)", () => {
    expect(toCommandOutcome(http(409, "CONCURRENT_MODIFICATION", [], "c-1"))).toEqual({
      kind: "stale",
      correlationId: "c-1",
    });
    expect(
      toCommandOutcome(http(409, "CONCURRENT_MODIFICATION", [{ field: "expectedVersion", message: "stale" }])),
    ).toEqual({ kind: "stale" });
  });

  it("maps 409 INVALID_STATE_TRANSITION to invalid-transition with the allowed statuses", () => {
    expect(
      toCommandOutcome(
        http(409, "INVALID_STATE_TRANSITION", [
          { field: "toStatus", message: "x", allowedValues: ["ON_HOLD", "REJECTED", "QUALIFIED"] },
        ]),
      ),
    ).toEqual({ kind: "invalid-transition", allowed: ["ON_HOLD", "REJECTED"] });
    expect(toCommandOutcome(http(409, "INVALID_STATE_TRANSITION"))).toEqual({ kind: "invalid-transition" });
  });

  it("maps 400 to rejected with the field names (the UI shows its own text)", () => {
    expect(
      toCommandOutcome(
        http(400, "VALIDATION_FAILED", [
          { field: "reason", message: "too long" },
          { field: "duplicateOfLeadId", message: "bad" },
        ], "c-2"),
      ),
    ).toEqual({ kind: "rejected", fields: ["reason", "duplicateOfLeadId"], correlationId: "c-2" });
    expect(toCommandOutcome(http(400, "VALIDATION_FAILED"))).toEqual({ kind: "rejected", fields: [] });
  });

  it("maps 422 to ineligible, 403 to forbidden and 404 to gone", () => {
    expect(toCommandOutcome(http(422, "INELIGIBLE_ASSIGNEE", [], "c-3"))).toEqual({
      kind: "ineligible",
      correlationId: "c-3",
    });
    expect(toCommandOutcome(http(403))).toEqual({ kind: "forbidden" });
    expect(toCommandOutcome(http(404, "NOT_FOUND", [], "c-4"))).toEqual({ kind: "gone" });
  });

  it("maps network, 5xx, 429 and the session cases to failed (retry, draft kept)", () => {
    expect(toCommandOutcome({ ok: false, kind: "network" })).toEqual({ kind: "failed" });
    expect(toCommandOutcome(http(500, undefined, [], "c-5"))).toEqual({ kind: "failed", correlationId: "c-5" });
    expect(toCommandOutcome(http(429))).toEqual({ kind: "failed" });
    expect(toCommandOutcome({ ok: false, kind: "unavailable" })).toEqual({ kind: "failed" });
    expect(toCommandOutcome({ ok: false, kind: "signed-out" })).toEqual({ kind: "failed" });
  });
});

describe("failureMessage (message kept by the actions slot)", () => {
  it("keeps the kind and the support code; a 400 without a known field is the general message", () => {
    expect(failureMessage({ kind: "stale", correlationId: "c" })).toEqual({ kind: "stale", correlationId: "c" });
    expect(failureMessage({ kind: "failed" })).toEqual({ kind: "failed" });
    expect(failureMessage({ kind: "forbidden" })).toEqual({ kind: "forbidden" });
    expect(failureMessage({ kind: "ineligible", correlationId: "d" })).toEqual({ kind: "ineligible", correlationId: "d" });
    expect(failureMessage({ kind: "rejected", fields: ["toStatus"], correlationId: "e" })).toEqual({
      kind: "bad-request",
      correlationId: "e",
    });
  });

  it("keeps the allowed statuses of a refused transition", () => {
    expect(failureMessage({ kind: "invalid-transition", allowed: ["ON_HOLD"] })).toEqual({
      kind: "invalid-transition",
      allowed: ["ON_HOLD"],
    });
    expect(failureMessage({ kind: "invalid-transition" })).toEqual({ kind: "invalid-transition" });
  });

  it("has no message for a lead that is gone (the page leaves for the list)", () => {
    expect(failureMessage({ kind: "gone" })).toBeNull();
  });
});
