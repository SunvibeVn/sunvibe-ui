import { z } from "zod";
import type { ChangeAppointmentInput, SurveyAppointment } from "@/features/surveys";
import { instantToLocalInput, localInputToInstant } from "@/lib/format/vietnam-time";

import {
  cleanText,
  crossChecks,
  durationOf,
  problemsOf,
  REASON_MAX,
  requiredText,
  type SurveyProblems,
} from "../../schemas/survey/survey-text";

import { type Place, placeOf, samePlace } from "./appointment-view";
import { checkTimeAndPlace, detailTexts, toMeetingLocation } from "./booking-form";

/** The edit dialog (spec 6.2): every editable field with its current value, plus a required reason. */
export type ChangeForm = {
  start: string;
  duration: string;
  place: Place;
  accessNote: string;
  onSiteContactName: string;
  onSiteContactRole: string;
  reason: string;
};

export type ChangeField =
  | "start"
  | "duration"
  | "address"
  | "ward"
  | "accessNote"
  | "onSiteContactName"
  | "onSiteContactRole"
  | "reason";

type Appointment = NonNullable<SurveyAppointment>;

/** The edit dialog filled with the appointment's current values (Vietnam time), the reason empty. */
export function changeDefaults(appointment: Appointment): ChangeForm {
  return {
    start: appointment.startAt ? instantToLocalInput(appointment.startAt) : "",
    duration: String(appointment.durationMinutes ?? ""),
    place: placeOf(appointment.meetingLocation),
    accessNote: appointment.accessNote ?? "",
    onSiteContactName: appointment.onSiteContactName ?? "",
    onSiteContactRole: appointment.onSiteContactRole ?? "",
    reason: "",
  };
}

/** Optional text as the change body sends it: cleaned, `null` when blank (an explicit null clears it, A-4). */
const nullableText = (value: string): string | null => {
  const text = cleanText(value);
  return text === "" ? null : text;
};

/** True when the start or the duration of the form differs from the appointment's. */
function timeChanged(form: ChangeForm, appointment: Appointment): boolean {
  const before = changeDefaults(appointment);
  return form.start !== before.start || durationOf(form.duration) !== (appointment.durationMinutes ?? null);
}

/** A new time or place removes the owner's confirmation (A-28): the dialog says so before saving. */
export function changeRemovesConfirmation(form: ChangeForm, appointment: Appointment): boolean {
  return timeChanged(form, appointment) || !samePlace(form.place, placeOf(appointment.meetingLocation));
}

/** True when the form changes no value of the appointment: the server would answer "Nothing changed." (A-4). */
export function changeIsEmpty(form: ChangeForm, appointment: Appointment): boolean {
  const before = changeDefaults(appointment);
  return (
    !changeRemovesConfirmation(form, appointment) &&
    nullableText(form.accessNote) === nullableText(before.accessNote) &&
    nullableText(form.onSiteContactName) === nullableText(before.onSiteContactName) &&
    nullableText(form.onSiteContactRole) === nullableText(before.onSiteContactRole)
  );
}

/** The change body (A-4): every key present, the unchanged values too, `null` for a blank optional text. */
export function toChangeBody(form: ChangeForm, appointment: Appointment, leadVersion: number): ChangeAppointmentInput {
  return {
    expectedLeadVersion: leadVersion,
    expectedAppointmentVersion: appointment.version ?? 0,
    reason: cleanText(form.reason),
    startAt: localInputToInstant(form.start),
    durationMinutes: durationOf(form.duration) ?? appointment.durationMinutes ?? 0,
    meetingLocation: toMeetingLocation(form.place),
    accessNote: nullableText(form.accessNote),
    onSiteContactName: nullableText(form.onSiteContactName),
    onSiteContactRole: nullableText(form.onSiteContactRole),
  };
}

/**
 * Checks the edit dialog (BR-4, A-14): a reason, the place and texts as the booking, and the start window only for a
 * new start, so an overdue appointment can still change its note or place (spec 4.8). `{}` when valid.
 */
export function validateChange(
  form: ChangeForm,
  appointment: Appointment,
  ctx: { now: number },
): SurveyProblems<ChangeField> {
  const texts = z.object({ ...detailTexts, reason: requiredText(REASON_MAX) });
  const newStart = form.start !== changeDefaults(appointment).start;
  const rest = crossChecks((refine) => checkTimeAndPlace(refine, form, { now: ctx.now, check: newStart }));
  return problemsOf<ChangeField>(texts.safeParse(form), rest);
}
