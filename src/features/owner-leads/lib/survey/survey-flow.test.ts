import { describe, expect, it } from "vitest";

import { toSurveyOutcome } from "./survey-flow";

describe("toSurveyOutcome (spec 6.7)", () => {
  it("is saved with the command answer", () => {
    const data = { survey: { leadId: "L1" }, lead: { status: "SURVEY_SCHEDULED" as const, version: 3 } };
    expect(toSurveyOutcome({ ok: true, data, status: 201, replayed: false, correlationId: "c" })).toEqual({
      kind: "saved",
      result: data,
    });
  });

  it("carries the mapped error of a failure", () => {
    expect(
      toSurveyOutcome({ ok: false, kind: "http", status: 409, code: "SURVEY_ALREADY_SCHEDULED", fieldErrors: [] }),
    ).toEqual({ kind: "failed", error: { kind: "already-scheduled" } });
    expect(toSurveyOutcome({ ok: false, kind: "network" })).toEqual({ kind: "failed", error: { kind: "retry" } });
  });
});
