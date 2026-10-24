import { z } from "zod";
import type { AppointmentKind, BookSurveyInput, MeetingLocationInput } from "@/features/surveys";
import { localInputToInstant } from "@/lib/format/vietnam-time";

import {
  ACCESS_NOTE_MAX,
  ADDRESS_MAX,
  addProblem,
  anyText,
  checkText,
  cleanText,
  CONTACT_MAX,
  crossChecks,
  durationOf,
  minuteInstant,
  optionalText,
  problemsOf,
  REASON_MAX,
  requiredText,
  startWindowProblem,
  type SurveyProblems,
} from "../../schemas/survey/survey-text";
import { PROVINCE_CODE } from "../../services/owner-leads-api";

import { type Place, placeDiffersFromLead } from "./appointment-view";

/** The book and re-survey dialog (spec 6.2). Texts as typed; `start` is a `datetime-local` value in Vietnam time. */
export type BookingForm = {
  start: string;
  /** Minutes, as the select's value. */
  duration: string;
  place: Place;
  locationReason: string;
  accessNote: string;
  onSiteContactName: string;
  onSiteContactRole: string;
  ownerConfirmed: boolean;
  confirmationNote: string;
  resurveyReason: string;
};

export type BookingField =
  | "start"
  | "duration"
  | "address"
  | "ward"
  | "locationReason"
  | "accessNote"
  | "onSiteContactName"
  | "onSiteContactRole"
  | "confirmationNote"
  | "resurveyReason";

/** The default duration of a booking (owner Q-5, A-5). */
export const DEFAULT_DURATION = 60;

/** A new booking: the lead's own place, 60 minutes, not confirmed (the owner's agreement is ticked by hand). */
export function bookingDefaults(leadPlace: Place): BookingForm {
  return {
    start: "",
    duration: String(DEFAULT_DURATION),
    place: leadPlace,
    locationReason: "",
    accessNote: "",
    onSiteContactName: "",
    onSiteContactRole: "",
    ownerConfirmed: false,
    confirmationNote: "",
    resurveyReason: "",
  };
}

/** The request place of a form place: trimmed address, the pilot province, the pin only when there is one. */
export function toMeetingLocation(place: Place): MeetingLocationInput {
  const location: MeetingLocationInput = {
    addressText: cleanText(place.addressText),
    provinceCode: PROVINCE_CODE,
    wardCode: place.wardCode,
  };
  if (place.latitude !== null && place.longitude !== null) {
    location.latitude = place.latitude;
    location.longitude = place.longitude;
  }
  return location;
}

/** Sets `key` to the cleaned text when it is not blank (A-24: blank optional text is absent). */
export function putText<T extends object, K extends keyof T>(target: T, key: K, value: string): void {
  const text = cleanText(value);
  if (text !== "") target[key] = text as T[K];
}

export type BookingContext = { kind: AppointmentKind; leadPlace: Place; leadVersion: number };

/**
 * The book body (spec 7.1) of a checked form. The meeting place is left out when it is the lead's own place (the
 * server then takes the lead's); the location reason goes with another place, the confirmation note only with Owner
 * confirmed (the server refuses it otherwise) and the re-survey reason only for a re-survey.
 */
export function toBookBody(form: BookingForm, ctx: BookingContext): BookSurveyInput {
  const body: BookSurveyInput = {
    expectedLeadVersion: ctx.leadVersion,
    startAt: localInputToInstant(form.start),
    durationMinutes: durationOf(form.duration) ?? DEFAULT_DURATION,
    ownerConfirmed: form.ownerConfirmed,
  };
  if (placeDiffersFromLead(form.place, ctx.leadPlace)) {
    body.meetingLocation = toMeetingLocation(form.place);
    putText(body, "locationReason", form.locationReason);
  }
  putText(body, "accessNote", form.accessNote);
  putText(body, "onSiteContactName", form.onSiteContactName);
  putText(body, "onSiteContactRole", form.onSiteContactRole);
  if (form.ownerConfirmed) putText(body, "confirmationNote", form.confirmationNote);
  if (ctx.kind === "RESURVEY") putText(body, "resurveyReason", form.resurveyReason);
  return body;
}

/** Checks of the start, the duration and the place, shared by the book and the change dialog. */
export function checkTimeAndPlace(
  ctx: z.RefinementCtx,
  values: { start: string; duration: string; place: Place },
  window: { now: number; check: boolean },
): void {
  const start = minuteInstant(values.start, localInputToInstant);
  if (typeof start === "string") addProblem(ctx, "start", start);
  else if (window.check) {
    const problem = startWindowProblem(start, window.now);
    if (problem !== null) addProblem(ctx, "start", problem);
  }
  if (durationOf(values.duration) === null) addProblem(ctx, "duration", "invalid");
  checkText(ctx, "address", requiredText(ADDRESS_MAX), values.place.addressText);
  if (values.place.wardCode === "") addProblem(ctx, "ward", "required");
}

/** The free texts of the place's details, shared by the book and the change dialog. */
export const detailTexts = {
  accessNote: optionalText(ACCESS_NOTE_MAX),
  onSiteContactName: optionalText(CONTACT_MAX),
  onSiteContactRole: optionalText(CONTACT_MAX),
};

/**
 * Checks the book dialog as the server does (BR-4, A-14, A-16, A-25): the start in whole minutes from the current
 * minute to 90 days ahead, a duration of the list, the place, a location reason when the place differs from the lead,
 * the texts' lengths and no phone number, and the re-survey reason for a re-survey. `{}` when valid.
 */
export function validateBooking(
  form: BookingForm,
  ctx: { kind: AppointmentKind; leadPlace: Place; now: number },
): SurveyProblems<BookingField> {
  const texts = z.object({
    ...detailTexts,
    confirmationNote: form.ownerConfirmed ? optionalText(REASON_MAX) : anyText,
    resurveyReason: ctx.kind === "RESURVEY" ? requiredText(REASON_MAX) : anyText,
  });
  const rest = crossChecks((refine) => {
    checkTimeAndPlace(refine, form, { now: ctx.now, check: true });
    if (placeDiffersFromLead(form.place, ctx.leadPlace)) {
      checkText(refine, "locationReason", requiredText(REASON_MAX), form.locationReason);
    }
  });
  return problemsOf<BookingField>(texts.safeParse(form), rest);
}
