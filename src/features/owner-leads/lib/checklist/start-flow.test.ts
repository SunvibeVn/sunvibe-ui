import { describe, expect, it } from "vitest";

import type { SurveyBlock } from "@/features/surveys";

import { checklistAction, checklistStartFailure } from "./start-flow";

const visited = {
  id: "AP2",
  appointmentNo: 2,
  status: "VISITED" as const,
  visit: { performedByName: "Anh Sale", arrivedAt: "2026-10-23T02:00:00Z" },
  checklists: [],
};

function block(overrides: Partial<NonNullable<SurveyBlock>>): NonNullable<SurveyBlock> {
  return { currentVisitId: "AP2", appointments: [visited], ...overrides };
}

describe("checklistAction (survey-checklist spec 6.1, W16-25)", () => {
  it("offers the start for the current visit, with the intake dialog when required", () => {
    expect(
      checklistAction(
        block({ checklistStart: { allowed: true, visitAppointmentId: "AP2", intakeDeclarationRequired: true, blockedBy: null } }),
      ),
    ).toEqual({ kind: "start", appointmentId: "AP2", surveyNo: 2, intake: true, performerName: "Anh Sale", arrivedAt: "2026-10-23T02:00:00Z" });
  });

  it("opens the current visit's checklist when there is one, whatever blocks a start", () => {
    const withChecklist = { ...visited, checklists: [{ id: "C3", checklistNo: 3 }, { id: "C1", checklistNo: 1 }] };
    for (const blockedBy of ["ALREADY_STARTED", "NOT_ASSIGNEE", "LEAD_STATUS"] as const) {
      expect(
        checklistAction(
          block({
            appointments: [withChecklist],
            checklistStart: { allowed: false, visitAppointmentId: null, intakeDeclarationRequired: false, blockedBy },
          }),
        ),
      ).toEqual({ kind: "open", checklistId: "C3", checklistNo: 3 });
    }
  });

  it("gives the block's reason when there is nothing to open", () => {
    expect(
      checklistAction(
        block({ checklistStart: { allowed: false, visitAppointmentId: null, intakeDeclarationRequired: false, blockedBy: "INTENT" } }),
      ),
    ).toEqual({ kind: "blocked", reason: "INTENT" });
    expect(
      checklistAction({
        currentVisitId: null,
        appointments: [],
        checklistStart: { allowed: false, visitAppointmentId: null, intakeDeclarationRequired: false, blockedBy: "NO_CURRENT_VISIT" },
      }),
    ).toEqual({ kind: "blocked", reason: "NO_CURRENT_VISIT" });
  });

  it("shows nothing for a block without checklistStart", () => {
    expect(checklistAction(block({ checklistStart: undefined }))).toBeNull();
  });
});

describe("checklistStartFailure (spec 6.3)", () => {
  it("maps each case by its kind", () => {
    expect(checklistStartFailure({ kind: "not-found" })).toEqual({ kind: "leave" });
    expect(checklistStartFailure({ kind: "signed-out" })).toEqual({ kind: "session" });
    expect(checklistStartFailure({ kind: "unavailable" })).toEqual({ kind: "session" });
    expect(checklistStartFailure({ kind: "not-allowed", notAllowedField: "status" })).toEqual({ kind: "message", message: "notAllowed", reload: true });
    expect(checklistStartFailure({ kind: "already-started" })).toEqual({ kind: "message", message: "alreadyStarted", reload: true });
    expect(checklistStartFailure({ kind: "surveyor-ineligible", correlationId: "c" })).toEqual({
      kind: "message",
      message: "surveyorIneligible",
      reload: true,
      correlationId: "c",
    });
    expect(checklistStartFailure({ kind: "forbidden" })).toEqual({ kind: "message", message: "forbidden", reload: true });
    expect(checklistStartFailure({ kind: "retry" })).toEqual({ kind: "message", message: "failed", reload: false });
  });

  it("puts a 400 on the intake fields, any other 400 as a message with a reload", () => {
    expect(
      checklistStartFailure({ kind: "validation", fieldErrors: { "intake.basis.confirmedOn": "x", "intake.reason": "y" } }),
    ).toEqual({ kind: "fields", problems: { "basis.confirmedOn": "invalid", reason: "invalid" } });
    expect(checklistStartFailure({ kind: "validation", fieldErrors: { intake: "x" } })).toEqual({
      kind: "message",
      message: "badRequest",
      reload: true,
    });
  });
});
