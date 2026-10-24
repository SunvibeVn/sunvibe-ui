import type { ChecklistStartBlock, ChecklistUiError, SurveyBlock } from "@/features/surveys";

// The checklist action of the Survey section (survey-checklist spec 6.1, W16-25) and what a refused start shows
// (spec 6.3), as pure functions.

export type ChecklistAction =
  | {
      kind: "start";
      appointmentId: string;
      surveyNo: number | null;
      /** The starter is not the visit's performer: the intake dialog asks where the information comes from. */
      intake: boolean;
      performerName: string | null;
      arrivedAt: string | null;
    }
  | { kind: "open"; checklistId: string; checklistNo: number | null }
  | { kind: "blocked"; reason: ChecklistStartBlock };

/**
 * Start when allowed; else "Open checklist #m" when the current visit has a checklist (its newest); else the first
 * block's reason. Null when the block carries no `checklistStart`.
 */
export function checklistAction(block: NonNullable<SurveyBlock>): ChecklistAction | null {
  const start = block.checklistStart;
  if (!start) return null;
  const appointments = (block.appointments ?? []).filter((entry) => entry !== null);
  const visitId = start.allowed ? start.visitAppointmentId : block.currentVisitId;
  const visit = appointments.find((entry) => entry?.id === visitId);
  if (start.allowed && start.visitAppointmentId) {
    return {
      kind: "start",
      appointmentId: start.visitAppointmentId,
      surveyNo: visit?.appointmentNo ?? null,
      intake: start.intakeDeclarationRequired === true,
      performerName: visit?.visit?.performedByName ?? null,
      arrivedAt: visit?.visit?.arrivedAt ?? null,
    };
  }
  const newest = (visit?.checklists ?? []).find((entry) => entry?.id);
  if (newest?.id) return { kind: "open", checklistId: newest.id, checklistNo: newest.checklistNo ?? null };
  return start.blockedBy ? { kind: "blocked", reason: start.blockedBy } : null;
}

/** A message key of `OwnerLeads.checklist.startErrors`. */
export type ChecklistStartMessage = "notAllowed" | "alreadyStarted" | "surveyorIneligible" | "forbidden" | "badRequest" | "failed";

/** The intake dialog's fields as the server names them under `intake.`. */
export type IntakeField = "reason" | "basis.confirmedOn" | "basis.text";

export type ChecklistStartStep =
  | { kind: "leave" }
  | { kind: "session" }
  | { kind: "fields"; problems: Partial<Record<IntakeField, "invalid">> }
  | { kind: "message"; message: ChecklistStartMessage; reload: boolean; correlationId?: string };

const INTAKE_FIELDS: readonly IntakeField[] = ["reason", "basis.confirmedOn", "basis.text"];

/** What a refused start does (spec 6.3): a message and a reload of the section, the intake fields, or the list. */
export function checklistStartFailure(error: ChecklistUiError): ChecklistStartStep {
  const support = error.correlationId === undefined ? {} : { correlationId: error.correlationId };
  const message = (key: ChecklistStartMessage, reload: boolean): ChecklistStartStep => ({ kind: "message", message: key, reload, ...support });
  switch (error.kind) {
    case "not-found":
      return { kind: "leave" };
    case "signed-out":
    case "unavailable":
      return { kind: "session" };
    case "not-allowed":
      return message("notAllowed", true);
    case "already-started":
      return message("alreadyStarted", true);
    case "surveyor-ineligible":
      return message("surveyorIneligible", true);
    case "forbidden":
      return message("forbidden", true);
    case "validation":
    case "correction-required": {
      const problems: Partial<Record<IntakeField, "invalid">> = {};
      for (const field of Object.keys(error.fieldErrors ?? {})) {
        const name = field.startsWith("intake.") ? field.slice("intake.".length) : "";
        if ((INTAKE_FIELDS as readonly string[]).includes(name)) problems[name as IntakeField] = "invalid";
      }
      // `intake` itself: the declaration is needed, or not needed (the performer); the section reads again.
      return Object.keys(problems).length > 0 ? { kind: "fields", problems } : message("badRequest", true);
    }
    case "form":
      return message("badRequest", true);
    default:
      return message("failed", false);
  }
}
