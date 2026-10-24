import { describe, expect, it } from "vitest";

import { surveyFailure } from "./survey-failure";

const BOOK_FIELDS = {
  startAt: "start",
  durationMinutes: "duration",
  "meetingLocation.addressText": "address",
  "meetingLocation.wardCode": "ward",
  accessNote: "accessNote",
} as const;

describe("surveyFailure (spec 6.7)", () => {
  it("puts a 400 on the dialog's fields", () => {
    expect(
      surveyFailure({ kind: "validation", fieldErrors: { startAt: "x", "meetingLocation.wardCode": "y" } }, BOOK_FIELDS),
    ).toEqual({ kind: "fields", problems: { start: "invalid", ward: "invalid" } });
  });

  it("gives the general message for a 400 on a field the dialog does not have", () => {
    expect(surveyFailure({ kind: "validation", fieldErrors: { other: "x" }, correlationId: "c" }, BOOK_FIELDS)).toEqual({
      kind: "message",
      message: "badRequest",
      reload: false,
      correlationId: "c",
    });
  });

  it("says Nothing changed. for a 400 without fields", () => {
    expect(surveyFailure({ kind: "form" }, BOOK_FIELDS)).toEqual({
      kind: "message",
      message: "nothingChanged",
      reload: false,
    });
  });

  it("leaves for the list on 404", () => {
    expect(surveyFailure({ kind: "not-found" }, BOOK_FIELDS)).toEqual({ kind: "leave" });
  });

  it("reloads with its message on a 409 (drafts kept)", () => {
    for (const [kind, message] of [
      ["stale", "stale"],
      ["already-scheduled", "alreadyScheduled"],
      ["not-allowed", "notAllowed"],
      ["no-current-visit", "noCurrentVisit"],
      ["invalid-transition", "invalidTransition"],
    ] as const) {
      expect(surveyFailure({ kind }, BOOK_FIELDS)).toEqual({ kind: "message", message, reload: true });
    }
  });

  it("shows the 422 messages; an ineligible surveyor reloads to show the flag", () => {
    expect(surveyFailure({ kind: "surveyor-ineligible" }, BOOK_FIELDS)).toEqual({
      kind: "message",
      message: "surveyorIneligible",
      reload: true,
    });
    expect(surveyFailure({ kind: "performer-mismatch" }, BOOK_FIELDS)).toEqual({
      kind: "message",
      message: "performerMismatch",
      reload: false,
    });
  });

  it("handles 403, retry cases and the session states as the lead pages", () => {
    expect(surveyFailure({ kind: "forbidden" }, BOOK_FIELDS)).toEqual({ kind: "message", message: "forbidden", reload: false });
    expect(surveyFailure({ kind: "retry", correlationId: "c" }, BOOK_FIELDS)).toEqual({
      kind: "message",
      message: "failed",
      reload: false,
      correlationId: "c",
    });
    expect(surveyFailure({ kind: "signed-out" }, BOOK_FIELDS)).toEqual({ kind: "session" });
    expect(surveyFailure({ kind: "unavailable" }, BOOK_FIELDS)).toEqual({ kind: "session" });
  });
});
