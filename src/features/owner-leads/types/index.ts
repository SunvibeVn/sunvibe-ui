import type { components } from "@/api/generated/schema";

type Schemas = components["schemas"];

/** Owner lead as a row of the staff queue (no phone, email, address or coordinates). */
export type LeadSummary = Schemas["OwnerLeadSummaryResponse"];
/** Owner lead with contact data, consent, possible duplicates and history. */
export type LeadDetail = Schemas["OwnerLeadDetailResponse"];
/** One history entry of a lead. */
export type LeadActivity = Schemas["LeadActivityResponse"];
/** A possible duplicate listed on the detail. */
export type DuplicateCandidate = Schemas["DuplicateCandidateResponse"];
/** A staff member a lead or a ward may be given to. */
export type EligibleAssignee = Schemas["LeadAssigneeResponse"];
/** A ward and the staff member who looks after it. */
export type Territory = Schemas["SaleTerritoryResponse"];
/** One page of the staff lead list. */
export type LeadPage = Schemas["LeadPageResponse"];
/** Answer to adding a note: the new history entry and the lead after it. */
export type LeadNoteResult = Schemas["LeadNoteResponse"];
/** A ward of the public catalog (wards of province 48). */
export type Ward = Schemas["WardResponse"];

export type LeadIntent = NonNullable<LeadSummary["intent"]>;
export type LeadPropertyType = NonNullable<LeadSummary["propertyType"]>;
export type WardType = NonNullable<Territory["wardType"]>;
export type ActivityType = NonNullable<LeadActivity["type"]>;
export type LeadSource = NonNullable<LeadDetail["source"]>;
export type AssigneeRole = NonNullable<EligibleAssignee["roles"]>[number];
export type PriceUnit = NonNullable<Schemas["AskingPriceResponse"]["unit"]>;

/**
 * The seven statuses of the W9 queue. The API enum also lists later statuses (VALIDATING, SURVEY_SCHEDULED, QUALIFIED,
 * AGREEMENT_PENDING, ONBOARDED) that W9 never produces; the workspace labels and offers only these seven.
 */
export const LEAD_STATUSES = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "ON_HOLD",
  "DUPLICATE",
  "REJECTED",
  "WITHDRAWN",
] as const satisfies readonly NonNullable<LeadSummary["status"]>[];

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Statuses a lead can still leave. */
export const OPEN_STATUSES = ["NEW", "ASSIGNED", "CONTACTED", "ON_HOLD"] as const satisfies readonly LeadStatus[];
/** Statuses a lead never leaves (acquisition BR-3). */
export const CLOSED_STATUSES = ["DUPLICATE", "REJECTED", "WITHDRAWN"] as const satisfies readonly LeadStatus[];

export type OpenLeadStatus = (typeof OPEN_STATUSES)[number];
export type ClosedLeadStatus = (typeof CLOSED_STATUSES)[number];

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

export function isOpenStatus(status: LeadStatus): status is OpenLeadStatus {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

/** True for a status the API sent that closes the lead for good (DUPLICATE, REJECTED, WITHDRAWN); false otherwise. */
export function isClosedLeadStatus(status?: string): boolean {
  return status !== undefined && (CLOSED_STATUSES as readonly string[]).includes(status);
}
