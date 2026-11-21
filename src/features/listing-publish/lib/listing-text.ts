import type { ListingCreation, ListingDetail, ListingRevisionItem } from "../types";

type ListingStateCode = ListingDetail["state"];
type RevisionStatusCode = ListingRevisionItem["status"];
type TransactionTypeCode = ListingDetail["transactionType"];
type ReasonGroupCode = ListingCreation["reasonGroups"][number];

// Keys relative to the `ListingPublish` namespace of en.json. A code this UI does not know reads its `OTHER` text, so
// it is shown and never dropped (E06S1-P9). `Record` over each generated union: a code without a key fails typecheck.

/** A listing state's text: listing section 3.2's five states, or "Another state". */
export type ListingStateKey = `states.${ListingStateCode | "OTHER"}`;
/** A revision status's text: listing section 3.3's eight statuses, or "Another state". */
export type RevisionStatusKey = `revisionStatuses.${RevisionStatusCode | "OTHER"}`;
/** A transaction type's text: "Long-term rental", or "Another transaction type". */
export type TransactionTypeKey = `transactionTypes.${TransactionTypeCode | "OTHER"}`;
/** The line of a group that stops a create, in E05's words; an unknown group reads "Another reason stops it.". */
export type ReasonGroupKey = `reasons.${ReasonGroupCode | "OTHER"}`;

const STATE_KEYS: Record<ListingStateCode, ListingStateKey> = {
  UNPUBLISHED: "states.UNPUBLISHED",
  PUBLISHED: "states.PUBLISHED",
  PAUSED: "states.PAUSED",
  URGENTLY_UNPUBLISHED: "states.URGENTLY_UNPUBLISHED",
  ARCHIVED: "states.ARCHIVED",
};

const REVISION_STATUS_KEYS: Record<RevisionStatusCode, RevisionStatusKey> = {
  DRAFT: "revisionStatuses.DRAFT",
  PENDING_REVIEW: "revisionStatuses.PENDING_REVIEW",
  NEEDS_CHANGES: "revisionStatuses.NEEDS_CHANGES",
  REJECTED: "revisionStatuses.REJECTED",
  APPROVED: "revisionStatuses.APPROVED",
  LIVE: "revisionStatuses.LIVE",
  REPLACED: "revisionStatuses.REPLACED",
  CANCELLED: "revisionStatuses.CANCELLED",
};

const TRANSACTION_TYPE_KEYS: Record<TransactionTypeCode, TransactionTypeKey> = {
  LONG_TERM_RENT: "transactionTypes.LONG_TERM_RENT",
};

const REASON_GROUP_KEYS: Record<ReasonGroupCode, ReasonGroupKey> = {
  NO_AGREEMENT: "reasons.NO_AGREEMENT",
  NOT_IN_EFFECT: "reasons.NOT_IN_EFFECT",
  NOT_STARTED: "reasons.NOT_STARTED",
  SUSPENDED: "reasons.SUSPENDED",
  ENDED: "reasons.ENDED",
  BASIS: "reasons.BASIS",
  PROPERTY: "reasons.PROPERTY",
  UNIT: "reasons.UNIT",
  OWNER: "reasons.OWNER",
};

/** The key of `code` in `table`, or `other` for a code the table does not hold (an own property only). */
function keyOf<K extends string>(table: Readonly<Record<string, K>>, code: string, other: K): K {
  return Object.hasOwn(table, code) ? (table[code] as K) : other;
}

export function listingStateKey(code: string): ListingStateKey {
  return keyOf<ListingStateKey>(STATE_KEYS, code, "states.OTHER");
}

export function revisionStatusKey(code: string): RevisionStatusKey {
  return keyOf<RevisionStatusKey>(REVISION_STATUS_KEYS, code, "revisionStatuses.OTHER");
}

export function transactionTypeKey(code: string): TransactionTypeKey {
  return keyOf<TransactionTypeKey>(TRANSACTION_TYPE_KEYS, code, "transactionTypes.OTHER");
}

export function reasonGroupKey(code: string): ReasonGroupKey {
  return keyOf<ReasonGroupKey>(REASON_GROUP_KEYS, code, "reasons.OTHER");
}
