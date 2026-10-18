import type vi from "@/i18n/messages/vi.json";

import type {
  ActivityType,
  AssigneeRole,
  LeadIntent,
  LeadSource,
  LeadPropertyType,
  LeadStatus,
  PriceUnit,
  WardType,
} from "../types";

type Messages = typeof vi.OwnerLeads;

/** Dotted path of every leaf string below a message object: "status.NEW", "detail.contact.title", ... */
type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafPaths<T[K]>}`;
}[keyof T & string];

/**
 * A key of the `OwnerLeads` namespace. Use it with `useTranslations("OwnerLeads")`: `t(STATUS_LABEL[status])`.
 * A path that does not exist in vi.json fails `npm run typecheck`.
 */
export type OwnerLeadsKey = LeafPaths<Messages>;

/** `Record` over the enum: a value without a label fails `npm run typecheck`. */
export const STATUS_LABEL: Record<LeadStatus, OwnerLeadsKey> = {
  NEW: "status.NEW",
  ASSIGNED: "status.ASSIGNED",
  CONTACTED: "status.CONTACTED",
  ON_HOLD: "status.ON_HOLD",
  DUPLICATE: "status.DUPLICATE",
  REJECTED: "status.REJECTED",
  WITHDRAWN: "status.WITHDRAWN",
};

/**
 * Label key for a status the API sent. The API enum has twelve values but the workspace labels the seven W9 ones; any
 * other value (or none) gets a generic label, so a badge never shows a raw code.
 */
export function statusLabelKey(status: string | undefined): OwnerLeadsKey {
  return status !== undefined && Object.hasOwn(STATUS_LABEL, status)
    ? STATUS_LABEL[status as LeadStatus]
    : "statusUnknown";
}

export const INTENT_LABEL: Record<LeadIntent, OwnerLeadsKey> = {
  SHORT_TERM_RENT: "intent.SHORT_TERM_RENT",
  LONG_TERM_RENT: "intent.LONG_TERM_RENT",
  SALE: "intent.SALE",
};

export const PROPERTY_TYPE_LABEL: Record<LeadPropertyType, OwnerLeadsKey> = {
  STUDIO: "propertyType.STUDIO",
  ONE_BEDROOM: "propertyType.ONE_BEDROOM",
  TWO_BEDROOM: "propertyType.TWO_BEDROOM",
  THREE_BEDROOM: "propertyType.THREE_BEDROOM",
  FOUR_BEDROOM: "propertyType.FOUR_BEDROOM",
  DUPLEX: "propertyType.DUPLEX",
  PENTHOUSE: "propertyType.PENTHOUSE",
  TOWNHOUSE: "propertyType.TOWNHOUSE",
  LAND: "propertyType.LAND",
  OTHER: "propertyType.OTHER",
};

export const WARD_TYPE_LABEL: Record<WardType, OwnerLeadsKey> = {
  WARD: "wardType.WARD",
  COMMUNE: "wardType.COMMUNE",
  SPECIAL_ZONE: "wardType.SPECIAL_ZONE",
};

export const ACTIVITY_LABEL: Record<ActivityType, OwnerLeadsKey> = {
  SUBMITTED: "activity.SUBMITTED",
  AUTO_ASSIGNED: "activity.AUTO_ASSIGNED",
  ASSIGNED: "activity.ASSIGNED",
  REASSIGNED: "activity.REASSIGNED",
  STATUS_CHANGED: "activity.STATUS_CHANGED",
  NOTE_ADDED: "activity.NOTE_ADDED",
};

/** Roles an assignee can hold (C-29): SALE and SALE_LEADER. */
export const ROLE_LABEL: Record<AssigneeRole, OwnerLeadsKey> = {
  SALE: "role.SALE",
  SALE_LEADER: "role.SALE_LEADER",
};

/** Suffix after the amount: "/đêm", "/tháng", " (giá bán)". Used by `formatPrice`. */
export const PRICE_UNIT_LABEL: Record<PriceUnit, OwnerLeadsKey> = {
  NIGHT: "priceUnit.NIGHT",
  MONTH: "priceUnit.MONTH",
  TOTAL: "priceUnit.TOTAL",
};

/** Where a lead came from (detail, asset section). */
export const SOURCE_LABEL: Record<LeadSource, OwnerLeadsKey> = {
  WEB: "source.WEB",
  REFERRAL: "source.REFERRAL",
  OUTBOUND: "source.OUTBOUND",
  PARTNER: "source.PARTNER",
  STAFF_ENTRY: "source.STAFF_ENTRY",
};

/** Label key for a source the API sent; any other value gets a generic label, never the raw code. */
export function sourceLabelKey(source: string | undefined): OwnerLeadsKey {
  return source !== undefined && Object.hasOwn(SOURCE_LABEL, source)
    ? SOURCE_LABEL[source as LeadSource]
    : "sourceUnknown";
}

/** Label key for a history entry type; a type this UI does not know gets a generic label. */
export function activityLabelKey(type: string | undefined): OwnerLeadsKey {
  return type !== undefined && Object.hasOwn(ACTIVITY_LABEL, type)
    ? ACTIVITY_LABEL[type as ActivityType]
    : "history.activityOther";
}

/**
 * Label key for an intent the API sent, or null for none (the API sends `null` for a missing optional field) or an
 * unknown value: the caller shows its empty text instead of a raw code or the namespace name.
 */
export function intentLabelKey(intent: string | null | undefined): OwnerLeadsKey | null {
  return typeof intent === "string" && Object.hasOwn(INTENT_LABEL, intent) ? INTENT_LABEL[intent as LeadIntent] : null;
}

/** Same as `intentLabelKey` for the property type (optional in the form, so `null` for many leads). */
export function propertyTypeLabelKey(type: string | null | undefined): OwnerLeadsKey | null {
  return typeof type === "string" && Object.hasOwn(PROPERTY_TYPE_LABEL, type)
    ? PROPERTY_TYPE_LABEL[type as LeadPropertyType]
    : null;
}

/** Same as `intentLabelKey` for the ward type (null for none or an unknown value). */
export function wardTypeLabelKey(type: string | null | undefined): OwnerLeadsKey | null {
  return typeof type === "string" && Object.hasOwn(WARD_TYPE_LABEL, type) ? WARD_TYPE_LABEL[type as WardType] : null;
}

/** Same as `intentLabelKey` for the price unit (null for none or an unknown value). */
export function priceUnitLabelKey(unit: string | null | undefined): OwnerLeadsKey | null {
  return typeof unit === "string" && Object.hasOwn(PRICE_UNIT_LABEL, unit) ? PRICE_UNIT_LABEL[unit as PriceUnit] : null;
}
