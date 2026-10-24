import type { BookingBlock, SurveyAppointment, SurveyBlock, SurveyLocation } from "@/features/surveys";

/** A place as the forms edit it: address, ward and an optional pin (both coordinates or none). */
export type Place = { addressText: string; wardCode: string; latitude: number | null; longitude: number | null };

/** The editable place of a place the API sent (nulls and missing fields become empty). */
export function placeOf(location: SurveyLocation | null | undefined): Place {
  const latitude = location?.latitude ?? null;
  const longitude = location?.longitude ?? null;
  const pinned = latitude !== null && longitude !== null;
  return {
    addressText: location?.addressText ?? "",
    wardCode: location?.wardCode ?? "",
    latitude: pinned ? latitude : null,
    longitude: pinned ? longitude : null,
  };
}

/** The address as the server compares it: NFC, trimmed, single-spaced, lower case. */
const addressKey = (address: string): string => address.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * True when the meeting place is not the lead's own place (A-16): its normalised address, its ward or its pin differs.
 * The booking then needs a location reason.
 */
export function placeDiffersFromLead(place: Place, leadPlace: Place): boolean {
  return (
    addressKey(place.addressText) !== addressKey(leadPlace.addressText) ||
    place.wardCode !== leadPlace.wardCode ||
    place.latitude !== leadPlace.latitude ||
    place.longitude !== leadPlace.longitude
  );
}

/** True when two places are the same for an appointment (exact address, ward and pin): a change of place. */
export function samePlace(a: Place, b: Place): boolean {
  return (
    a.addressText.normalize("NFC").trim() === b.addressText.normalize("NFC").trim() &&
    a.wardCode === b.wardCode &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude
  );
}

const appointmentsOf = (block: SurveyBlock | null | undefined): NonNullable<SurveyAppointment>[] =>
  (block?.appointments ?? []).filter((entry): entry is NonNullable<SurveyAppointment> => entry !== null);

/** The one SCHEDULED appointment of the lead (I-1), if any. */
export function scheduledAppointment(block: SurveyBlock | null | undefined): NonNullable<SurveyAppointment> | undefined {
  return appointmentsOf(block).find((entry) => entry.status === "SCHEDULED");
}

/**
 * The appointment an open dialog edits: the scheduled one while it is still the appointment the dialog was opened for,
 * else null (cancelled, visited or replaced meanwhile, seen after a reload), so a dialog never sends to another one.
 */
export function dialogAppointment(
  block: SurveyBlock | null | undefined,
  appointmentId: string,
): NonNullable<SurveyAppointment> | null {
  const scheduled = scheduledAppointment(block);
  return scheduled !== undefined && scheduled.id === appointmentId ? scheduled : null;
}

/** The visited and cancelled appointments, newest first as the API sends them. */
export function earlierAppointments(block: SurveyBlock | null | undefined): NonNullable<SurveyAppointment>[] {
  return appointmentsOf(block).filter((entry) => entry.status !== "SCHEDULED");
}

export type HolderOption = { userId: string; name: string | null };

/**
 * The people who held the appointment, each once: the current surveyor first, then the earlier holders, newest first.
 * The proxy form picks the performer from these (A-8).
 */
export function holderOptions(appointment: SurveyAppointment): HolderOption[] {
  const options: HolderOption[] = [];
  const add = (userId: string | null | undefined, name: string | null | undefined) => {
    if (!userId) return;
    const known = options.find((option) => option.userId === userId);
    if (known === undefined) options.push({ userId, name: name ?? null });
    else if (known.name === null && name) known.name = name;
  };
  const holders = [...(appointment?.holders ?? [])].reverse();
  const current = holders.find((holder) => holder?.userId === appointment?.surveyorUserId && holder?.name);
  add(appointment?.surveyorUserId, current?.name ?? appointment?.surveyorName);
  for (const holder of holders) add(holder?.userId, holder?.name);
  return options;
}

/** "own" only when the user is the current surveyor and records their own visit; every other record is a proxy (A-8). */
export function visitMode(userId: string, appointment: SurveyAppointment, performerId: string): "own" | "proxy" {
  return appointment?.surveyorUserId === userId && performerId === userId ? "own" : "proxy";
}

/** Why the lead cannot get a booking now ("UNKNOWN" when the API named no reason); null when it can (spec 6.1). */
export type BookingBlockKey = BookingBlock | "UNKNOWN";

const BLOCKS: readonly BookingBlock[] = ["ALREADY_SCHEDULED", "NO_ASSIGNEE", "LEAD_STATUS", "INTENT", "SURVEYOR_INELIGIBLE"];

export function bookingBlockKey(block: SurveyBlock | null | undefined): BookingBlockKey | null {
  const booking = block?.booking;
  if (booking?.allowed === true) return null;
  const reason = booking?.blockedBy;
  return reason !== null && reason !== undefined && (BLOCKS as readonly string[]).includes(reason) ? reason : "UNKNOWN";
}
