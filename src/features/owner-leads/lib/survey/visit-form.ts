import { z } from "zod";
import type { RecordVisitInput, SurveyAppointment } from "@/features/surveys";
import { instantToLocalInput, localInputToInstant, vietnamDate } from "@/lib/format/vietnam-time";

import {
  addProblem,
  anyText,
  basisDateProblem,
  cleanText,
  crossChecks,
  minuteInstant,
  problemsOf,
  REASON_MAX,
  requiredText,
  type SurveyProblems,
  VISIT_NOTE_MAX,
} from "../../schemas/survey/survey-text";

/** The record-visit dialog (spec 6.2). `arrivedAt` is a `datetime-local` value in Vietnam time. */
export type VisitForm = {
  arrivedAt: string;
  note: string;
  /** Who reached the property: a holder of the appointment (A-8). */
  performerId: string;
  proxyReason: string;
  /** `yyyy-MM-dd` (Vietnam). */
  basisDate: string;
  basisText: string;
};

export type VisitField = "arrivedAt" | "note" | "performerId" | "proxyReason" | "basisDate" | "basisText";

type Appointment = NonNullable<SurveyAppointment>;

/**
 * Arrived now (the current minute, Vietnam time); the surveyor records their own visit, anyone else starts with the
 * current surveyor as the performer.
 */
export function visitDefaults(now: number, userId: string, appointment: Appointment): VisitForm {
  const surveyor = appointment.surveyorUserId ?? "";
  return {
    arrivedAt: instantToLocalInput(new Date(now).toISOString()),
    note: "",
    performerId: surveyor === userId ? userId : surveyor,
    proxyReason: "",
    basisDate: "",
    basisText: "",
  };
}

/** The visit body (spec 7.1): an own record carries no proxy; every other record carries reason and basis (A-8). */
export function toVisitBody(
  form: VisitForm,
  mode: "own" | "proxy",
  ctx: { leadVersion: number; appointment: Appointment },
): RecordVisitInput {
  const body: RecordVisitInput = {
    expectedLeadVersion: ctx.leadVersion,
    expectedAppointmentVersion: ctx.appointment.version ?? 0,
    arrivedAt: localInputToInstant(form.arrivedAt),
    note: cleanText(form.note),
    performedByUserId: form.performerId,
  };
  if (mode === "proxy") {
    body.proxy = {
      reason: cleanText(form.proxyReason),
      basis: { confirmedOn: form.basisDate, text: cleanText(form.basisText) },
    };
  }
  return body;
}

/**
 * Checks the record-visit dialog (US-3, BR-9, A-14, A-25): an arrival not in the future, a note, and for a proxy
 * record (only for SALE_LEADER, SALES_MANAGER, ADMIN) a reason and a basis dated from the arrival day to today. The
 * server checks the rest (creation minute, 60 minutes before the start, the holder at the arrival). `{}` when valid.
 */
export function validateVisit(
  form: VisitForm,
  ctx: { mode: "own" | "proxy"; canProxy: boolean; now: number },
): SurveyProblems<VisitField> {
  const proxy = ctx.mode === "proxy";
  const texts = z.object({
    note: requiredText(VISIT_NOTE_MAX),
    proxyReason: proxy ? requiredText(REASON_MAX) : anyText,
    basisText: proxy ? requiredText(REASON_MAX) : anyText,
  });
  const rest = crossChecks((refine) => {
    const arrived = minuteInstant(form.arrivedAt, localInputToInstant);
    if (typeof arrived === "string") addProblem(refine, "arrivedAt", arrived);
    else if (arrived > ctx.now) addProblem(refine, "arrivedAt", "tooLate");
    if (!proxy) return;
    if (!ctx.canProxy) addProblem(refine, "performerId", "notAllowed");
    const arrivalDay = typeof arrived === "number" ? vietnamDate(new Date(arrived).toISOString()) : undefined;
    const date = basisDateProblem(form.basisDate, vietnamDate(new Date(ctx.now).toISOString()), arrivalDay);
    if (date !== null) addProblem(refine, "basisDate", date);
  });
  return problemsOf<VisitField>(texts.safeParse(form), rest);
}
