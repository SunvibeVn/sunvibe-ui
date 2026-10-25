import type { components } from "@/api/generated/schema";
import type { Scope } from "@/features/workspace";

type Schemas = components["schemas"];

/**
 * A response as the API sends it: it writes an empty column as `null` (it leaves no field out), while the contract marks
 * the fields only optional. Every field, at every depth, may be left out or `null`, so the compiler asks for both.
 */
export type ApiShape<T> = T extends readonly (infer U)[]
  ? ApiShape<U>[]
  : T extends object
    ? { [K in keyof T]?: ApiShape<NonNullable<T[K]>> | null }
    : T;

/** The survey block of a lead: booking state, appointments (newest first), resumptions (spec 7.2). */
export type SurveyBlock = ApiShape<Schemas["SurveyBlockResponse"]>;
/** One appointment of the block, with its revisions, events, holders, visit and cancellation. */
export type SurveyAppointment = ApiShape<Schemas["SurveyAppointmentResponse"]>;
export type SurveyLocation = ApiShape<Schemas["SurveyLocationResponse"]>;
export type SurveyConfirmation = ApiShape<Schemas["SurveyConfirmationResponse"]>;
export type SurveyHolder = ApiShape<Schemas["SurveyHolderResponse"]>;
export type SurveyRevision = ApiShape<Schemas["SurveyRevisionResponse"]>;
export type SurveyVisit = ApiShape<Schemas["SurveyVisitResponse"]>;
export type SurveyCancellation = ApiShape<Schemas["SurveyCancellationResponse"]>;
export type SurveyResumption = ApiShape<Schemas["SurveyResumptionResponse"]>;
/** The answer of every survey command: block, lead state, History row (null for a no-op) and overlaps (A-23). */
export type SurveyCommandResult = ApiShape<Schemas["SurveyCommandResponse"]>;
export type SurveyHistoryEntry = ApiShape<Schemas["SurveyHistoryEntryResponse"]>;
export type SurveyOverlap = ApiShape<Schemas["SurveyOverlapResponse"]>;
export type SurveyOverlaps = ApiShape<Schemas["SurveyOverlapsResponse"]>;
/** One page of `/workspace/surveys` (SCHEDULED only, no private fields: US-4 AC-1). */
export type SurveyPage = ApiShape<Schemas["SurveyPageResponse"]>;
export type SurveyListItem = ApiShape<Schemas["SurveyListItemResponse"]>;
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
