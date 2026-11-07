import { describe, expect, it } from "vitest";

import type { SurveyBlock } from "../../types";
import { checklistAction, checklistStartFailure, revisionAction } from "./start-flow";

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
    for (const blockedBy of ["CHECKLIST_EXISTS", "NOT_ASSIGNEE", "LEAD_STATUS"] as const) {
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

describe("revisionAction (survey-checklist submission spec 6.1, A-7)", () => {
  const returned = {
    ...visited,
    checklists: [{ id: "C2", checklistNo: 2, status: "NEEDS_CHANGES" as const, outcome: "NEEDS_CHANGES" as const }],
  };
  const earlierVisit = { id: "AP1", appointmentNo: 1, status: "VISITED" as const, checklists: [{ id: "C1", checklistNo: 1 }] };

  it("offers the next revision on the revision the block names, without intake for the previous holder", () => {
    expect(
      revisionAction(
        block({
          appointments: [returned, earlierVisit],
          revisionStart: { allowed: true, checklistId: "C2", intakeRequired: false, blockedBy: null },
        }),
      ),
    ).toEqual({
      kind: "start",
      checklistId: "C2",
      revisionNo: 3,
      intake: false,
      performerName: "Anh Sale",
      arrivedAt: "2026-10-23T02:00:00Z",
    });
  });

  it("asks for the intake declaration when the viewer did not hold the previous revision", () => {
    const action = revisionAction(
      block({ appointments: [returned], revisionStart: { allowed: true, checklistId: "C2", intakeRequired: true, blockedBy: null } }),
    );
    expect(action).toMatchObject({ kind: "start", intake: true, revisionNo: 3 });
  });

  it("numbers the revision after the highest checklist of the lead, on any visit", () => {
    const later = { id: "AP3", appointmentNo: 3, status: "VISITED" as const, checklists: [{ id: "C5", checklistNo: 5 }] };
    const action = revisionAction(
      block({ appointments: [returned, later], revisionStart: { allowed: true, checklistId: "C2", intakeRequired: false, blockedBy: null } }),
    );
    expect(action).toMatchObject({ revisionNo: 6 });
  });

  it("says why when the revision waits for someone else", () => {
    for (const blockedBy of ["NOT_ASSIGNEE", "ASSIGNEE_INELIGIBLE"] as const) {
      expect(revisionAction(block({ revisionStart: { allowed: false, checklistId: null, intakeRequired: false, blockedBy } }))).toEqual({
        kind: "blocked",
        reason: blockedBy,
      });
    }
  });

  it("shows nothing while no revision is due", () => {
    for (const blockedBy of ["NO_CURRENT_VISIT", "LEAD_STATUS", "NOT_RETURNED_FOR_DOCUMENTS"] as const) {
      expect(revisionAction(block({ revisionStart: { allowed: false, checklistId: null, intakeRequired: false, blockedBy } }))).toBeNull();
    }
    expect(revisionAction(block({}))).toBeNull();
    expect(revisionAction(block({ revisionStart: { allowed: true, checklistId: null, intakeRequired: false, blockedBy: null } }))).toBeNull();
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
