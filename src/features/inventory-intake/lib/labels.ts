import type en from "@/i18n/messages/en.json";

import type {
  AssetType,
  AvailabilityState,
  CaseOutcome,
  CaseSignal,
  CaseStatus,
  GateReason,
  IntakeStatus,
  MissingForBrokerage,
  NotCarried,
  PreviewWarning,
  ReadinessReason,
  ReadinessState,
  RentalScope,
  UnitAvailability,
  UnitReason,
} from "../types";

type Messages = typeof en.InventoryIntake;

/** Dotted path of every leaf string below a message object. */
type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafPaths<T[K]>}`;
}[keyof T & string];

/** A key of the `InventoryIntake` namespace; a path that does not exist in en.json fails `npm run typecheck`. */
export type IntakeKey = LeafPaths<Messages>;

/** `Record` over the enum: a value without a label fails `npm run typecheck`. */
export const INTAKE_STATUS_LABEL: Record<IntakeStatus | "NONE", IntakeKey> = {
  NONE: "status.NONE",
  DRAFT: "status.DRAFT",
  AWAITING_OWNER: "status.AWAITING_OWNER",
  OWNER_CONFIRMED: "status.OWNER_CONFIRMED",
  CASE_OPEN: "status.CASE_OPEN",
  COMPLETED: "status.COMPLETED",
};

export const GATE_REASON_LABEL: Record<GateReason, IntakeKey> = {
  NOT_LONG_TERM: "gate.reasons.NOT_LONG_TERM",
  NOT_QUALIFIED: "gate.reasons.NOT_QUALIFIED",
  NO_PASSED: "gate.reasons.NO_PASSED",
  PASSED_NOT_USABLE: "gate.reasons.PASSED_NOT_USABLE",
  TYPE_SCOPE_MISMATCH: "gate.reasons.TYPE_SCOPE_MISMATCH",
  RECONCILIATION_REQUIRED: "gate.reasons.RECONCILIATION_REQUIRED",
  RESTRICTED: "gate.reasons.RESTRICTED",
};

export const READINESS_STATE_LABEL: Record<ReadinessState, IntakeKey> = {
  NONE: "readiness.state.NONE",
  USABLE: "readiness.state.USABLE",
  SUSPENDED: "readiness.state.SUSPENDED",
  ENDED: "readiness.state.ENDED",
};

export const READINESS_REASON_LABEL: Record<ReadinessReason, IntakeKey> = {
  LEAD_ON_HOLD: "readiness.reasons.LEAD_ON_HOLD",
  EVIDENCE_HELD: "readiness.reasons.EVIDENCE_HELD",
  OWNER_NOT_CONFIRMED: "readiness.reasons.OWNER_NOT_CONFIRMED",
  OWNER_NOT_ELIGIBLE: "readiness.reasons.OWNER_NOT_ELIGIBLE",
  RESTRICTED: "readiness.reasons.RESTRICTED",
  DUPLICATE: "readiness.reasons.DUPLICATE",
  REJECTED: "readiness.reasons.REJECTED",
  WITHDRAWN: "readiness.reasons.WITHDRAWN",
  REQUALIFIED: "readiness.reasons.REQUALIFIED",
  INTENT_CHANGED: "readiness.reasons.INTENT_CHANGED",
  EVIDENCE_GONE: "readiness.reasons.EVIDENCE_GONE",
};

export const UNIT_REASON_LABEL: Record<UnitReason, IntakeKey> = {
  RESTRICTED: "readiness.unitReasons.RESTRICTED",
  AVAILABILITY_DIFFERS: "readiness.unitReasons.AVAILABILITY_DIFFERS",
};

export const MISSING_FOR_BROKERAGE_LABEL: Record<MissingForBrokerage, IntakeKey> = {
  AGREEMENT: "readiness.missing.AGREEMENT",
  ADVERTISING_PERMISSION: "readiness.missing.ADVERTISING_PERMISSION",
  CONFIRMED_TERMS: "readiness.missing.CONFIRMED_TERMS",
  PHOTO_RIGHTS: "readiness.missing.PHOTO_RIGHTS",
};

export const ASSET_TYPE_LABEL: Record<AssetType, IntakeKey> = {
  HOUSE: "assetType.HOUSE",
  WHOLE_BUILDING: "assetType.WHOLE_BUILDING",
  VILLA: "assetType.VILLA",
  HOMESTAY: "assetType.HOMESTAY",
  CONDOTEL: "assetType.CONDOTEL",
  APARTMENT: "assetType.APARTMENT",
};

export const RENTAL_SCOPE_LABEL: Record<RentalScope, IntakeKey> = {
  WHOLE: "rentalScope.WHOLE",
  PARTS: "rentalScope.PARTS",
};

export const AVAILABILITY_STATE_LABEL: Record<AvailabilityState, IntakeKey> = {
  VACANT: "availabilityState.VACANT",
  OCCUPIED: "availabilityState.OCCUPIED",
  UNDER_REPAIR: "availabilityState.UNDER_REPAIR",
  PAUSED: "availabilityState.PAUSED",
  OWNER_UNSURE: "availabilityState.OWNER_UNSURE",
  SOURCE_CONFLICT: "availabilityState.SOURCE_CONFLICT",
};

export const UNIT_AVAILABILITY_LABEL: Record<UnitAvailability, IntakeKey> = {
  AVAILABLE: "unitAvailability.AVAILABLE",
  OCCUPIED: "unitAvailability.OCCUPIED",
  MAINTENANCE: "unitAvailability.MAINTENANCE",
  BLOCKED: "unitAvailability.BLOCKED",
};

export const NOT_CARRIED_LABEL: Record<NotCarried, IntakeKey> = {
  PHOTOS: "notCarried.PHOTOS",
  NOTES: "notCarried.NOTES",
  CONTACT: "notCarried.CONTACT",
  TERMS: "notCarried.TERMS",
};

export const WARNING_LABEL: Record<PreviewWarning, IntakeKey> = {
  TERMS_UNCONFIRMED: "warnings.TERMS_UNCONFIRMED",
  UNIT_UNCLASSIFIED: "warnings.UNIT_UNCLASSIFIED",
  AVAILABILITY_DIFFERS: "warnings.AVAILABILITY_DIFFERS",
  LEGACY_PROPERTY: "warnings.LEGACY_PROPERTY",
  SAME_PHONE_LEAD: "warnings.SAME_PHONE_LEAD",
};

export const CASE_SIGNAL_LABEL: Record<CaseSignal, IntakeKey> = {
  ADDRESS: "case.signal.ADDRESS",
  PIN: "case.signal.PIN",
  INTAKE: "case.signal.INTAKE",
  LINK_PLACE: "case.signal.LINK_PLACE",
};

export const CASE_STATUS_LABEL: Record<CaseStatus, IntakeKey> = {
  OPEN: "case.status.OPEN",
  DECIDED: "case.status.DECIDED",
  CLOSED: "case.status.CLOSED",
};

export const CASE_OUTCOME_LABEL: Record<CaseOutcome, IntakeKey> = {
  DIFFERENT_ASSET: "case.outcome.DIFFERENT_ASSET",
  SAME_ASSET: "case.outcome.SAME_ASSET",
};

/** Key of a label the API sent as free string, or null for a value this UI does not know. */
export function labelOf<K extends string>(table: Record<K, IntakeKey>, value: string | null | undefined): IntakeKey | null {
  return typeof value === "string" && Object.hasOwn(table, value) ? table[value as K] : null;
}
