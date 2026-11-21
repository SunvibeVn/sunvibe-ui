import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fieldErrorsOf, invalidState, messageState, successState } from "./form-state";

describe("form state of the listing-publish forms (E06S3-P13 (2))", () => {
  it("formState_fieldErrorsOf_firstIssuePerField: each field keeps the problem of its first issue", () => {
    const error = new z.ZodError([
      { code: "custom", path: ["channel"], message: "channel", input: null },
      { code: "custom", path: ["channel"], message: "second", input: null },
      { code: "custom", path: ["note"], message: "noteTooLong", input: "" },
    ]);
    expect(fieldErrorsOf(error)).toEqual({ channel: "channel", note: "noteTooLong" });
  });

  it("formState_steps_statusKeyAndErrors: invalid values, a sentence and a success each give their state", () => {
    expect([invalidState({ outcome: "outcome" }), messageState("freshness.answers.failed"), successState()]).toEqual([
      { status: "error", fieldErrors: { outcome: "outcome" } },
      { status: "error", messageKey: "freshness.answers.failed" },
      { status: "success" },
    ]);
  });
});
