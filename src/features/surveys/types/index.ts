import type { components } from "@/api/generated/schema";
import type { Scope } from "@/features/workspace";

type Schemas = components["schemas"];

/** The survey block of a lead: booking state, appointments (newest first), resumptions (spec 7.2). */
export type SurveyBlock = Schemas["SurveyBlockResponse"];
/** One appointment of the block, with its revisions, events, holders, visit and cancellation. */
export type SurveyAppointment = Schemas["SurveyAppointmentResponse"];
export type SurveyLocation = Schemas["SurveyLocationResponse"];
export type SurveyConfirmation = Schemas["SurveyConfirmationResponse"];
export type SurveyHolder = Schemas["SurveyHolderResponse"];
export type SurveyRevision = Schemas["SurveyRevisionResponse"];
export type SurveyVisit = Schemas["SurveyVisitResponse"];
export type SurveyCancellation = Schemas["SurveyCancellationResponse"];
export type SurveyResumption = Schemas["SurveyResumptionResponse"];
/** The answer of every survey command: block, lead state, History row (null for a no-op) and overlaps (A-23). */
export type SurveyCommandResult = Schemas["SurveyCommandResponse"];
export type SurveyHistoryEntry = Schemas["SurveyHistoryEntryResponse"];
export type SurveyOverlap = Schemas["SurveyOverlapResponse"];
export type SurveyOverlaps = Schemas["SurveyOverlapsResponse"];
/** One page of `/workspace/surveys` (SCHEDULED only, no private fields: US-4 AC-1). */
export type SurveyPage = Schemas["SurveyPageResponse"];
export type SurveyListItem = Schemas["SurveyListItemResponse"];
/** A staff member who can hold leads, so be a surveyor (C-1). */
export type Surveyor = Schemas["LeadAssigneeResponse"];

export type BookSurveyInput = Schemas["BookAppointmentRequest"];
/** Every key present; `null` clears an optional field (A-4). */
export type ChangeAppointmentInput = Schemas["ChangeAppointmentRequest"];
export type SetConfirmationInput = {
  expectedLeadVersion: number;
  expectedAppointmentVersion: number;
  confirmed: boolean;
  note?: string;
};
export type CancelAppointmentInput = Omit<Schemas["CancelAppointmentRequest"], "cancelReason"> & {
  cancelReason: UserCancelReason;
};
export type RecordVisitInput = Schemas["RecordVisitRequest"];
export type ResumeSurveyInput = Schemas["ResumeSurveyRequest"];
export type MeetingLocationInput = Schemas["MeetingLocationRequest"];
export type BasisInput = Schemas["BasisRequest"];

export type AppointmentKind = NonNullable<Schemas["SurveyAppointmentResponse"]["kind"]>;
export type AppointmentStatus = NonNullable<Schemas["SurveyAppointmentResponse"]["status"]>;
export type ConfirmationState = NonNullable<Schemas["SurveyConfirmationResponse"]["state"]>;
export type ConfirmationCause = NonNullable<Schemas["SurveyConfirmationResponse"]["cause"]>;
export type BookingBlock = NonNullable<Schemas["SurveyBookingResponse"]["blockedBy"]>;
export type CancelReason = NonNullable<Schemas["SurveyCancellationResponse"]["cancelReason"]>;
export type RecordKind = NonNullable<Schemas["SurveyVisitResponse"]["recordKind"]>;
export type SurveyGroup = NonNullable<Schemas["SurveyListItemResponse"]["group"]>;

/** The cancel reasons a user may pick, in the select's order (spec 4.6); the system ones are refused by the API. */
export const USER_CANCEL_REASONS = ["OWNER_CANCELLED", "STAFF_CANCELLED", "OWNER_ABSENT", "NO_ACCESS", "OTHER"] as const;
export type UserCancelReason = (typeof USER_CANCEL_REASONS)[number];

/** Query of `GET /api/v1/staff/survey-appointments`; `surveyorUserId` only with `all` (spec 7.1). */
export type SurveyListQuery = {
  scope: Scope;
  surveyorUserId?: string;
  /** Zero-based. */
  page: number;
  size: number;
};

/** Query of the overlap pre-check; on edit the appointment itself is left out. */
export type OverlapQuery = { startAt: string; durationMinutes: number; excludeAppointmentId?: string };

export * from "./checklist";
export * from "./media";
