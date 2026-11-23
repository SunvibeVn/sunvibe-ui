import type { ListingRevisionDecisionRequest, ListingRevisionReview } from "../types";

import type { ListingKey } from "./revision-text";

type IneligibilityCode = ListingRevisionReview["notEligibleReasons"][number];
type CheckCode = ListingRevisionReview["checklist"][number];
type ChangeReasonCode = NonNullable<ListingRevisionDecisionRequest["changeReasons"]>[number];
type RejectionGroupCode = NonNullable<ListingRevisionDecisionRequest["rejectionGroup"]>;
type OutcomeCode = ListingRevisionDecisionRequest["outcome"];
type TermsMatchCode = ListingRevisionReview["termsMatch"];
type AvailabilityCode = NonNullable<ListingRevisionReview["unit"]["availability"]>;

// Codes of the review (listing-publish E06-S4) to the keys of `ListingPublish.review`: every text is English (G2 D-48)
// and says the code's meaning in the brief's words (spec section 6, E06S4-P13). `Record` over each generated union: a
// code without a key fails typecheck. A code this UI does not know reads its `unknown` text, so it is shown and never
// dropped (as E06S1-P9 does with `OTHER`; here `OTHER` is itself a code of the reasons and the groups).

const INELIGIBILITY_KEYS: Record<IneligibilityCode, ListingKey> = {
  NOT_A_REVIEWER: "review.ineligible.NOT_A_REVIEWER",
  AUTHOR: "review.ineligible.AUTHOR",
  ASSIGNED_SALE: "review.ineligible.ASSIGNED_SALE",
  NOT_PENDING: "review.ineligible.NOT_PENDING",
  LISTING_ARCHIVED: "review.ineligible.LISTING_ARCHIVED",
};

const CHECK_KEYS: Record<CheckCode, ListingKey> = {
  CONTENT_MATCHES_UNIT: "review.checks.CONTENT_MATCHES_UNIT",
  TEXT_FOLLOWS_RULES: "review.checks.TEXT_FOLLOWS_RULES",
  TERMS_MATCH_AGREEMENT: "review.checks.TERMS_MATCH_AGREEMENT",
  NO_FRAUD_SIGNS: "review.checks.NO_FRAUD_SIGNS",
  AGREEMENT_END_AND_RIGHT: "review.checks.AGREEMENT_END_AND_RIGHT",
};

const CHANGE_REASON_KEYS: Record<ChangeReasonCode, ListingKey> = {
  CONTENT_MISMATCH: "review.changeReasons.CONTENT_MISMATCH",
  TEXT_RULE_VIOLATION: "review.changeReasons.TEXT_RULE_VIOLATION",
  MISSING_INFORMATION: "review.changeReasons.MISSING_INFORMATION",
  TERMS_MISMATCH: "review.changeReasons.TERMS_MISMATCH",
  OTHER: "review.changeReasons.OTHER",
};

const REJECTION_GROUP_KEYS: Record<RejectionGroupCode, ListingKey> = {
  SUSPECTED_FRAUD: "review.rejectionGroups.SUSPECTED_FRAUD",
  WRONG_UNIT: "review.rejectionGroups.WRONG_UNIT",
  SERIOUS_VIOLATION: "review.rejectionGroups.SERIOUS_VIOLATION",
  OTHER: "review.rejectionGroups.OTHER",
};

const OUTCOME_KEYS: Record<OutcomeCode, ListingKey> = {
  APPROVED: "review.outcomes.APPROVED",
  NEEDS_CHANGES: "review.outcomes.NEEDS_CHANGES",
  REJECTED: "review.outcomes.REJECTED",
};

const TERMS_MATCH_KEYS: Record<TermsMatchCode, ListingKey> = {
  IN_EFFECT: "review.termsMatch.IN_EFFECT",
  PENDING_START: "review.termsMatch.PENDING_START",
  NONE: "review.termsMatch.NONE",
  NO_SNAPSHOT: "review.termsMatch.NO_SNAPSHOT",
};

const AVAILABILITY_KEYS: Record<AvailabilityCode, ListingKey> = {
  AVAILABLE: "review.availabilities.AVAILABLE",
  OCCUPIED: "review.availabilities.OCCUPIED",
  MAINTENANCE: "review.availabilities.MAINTENANCE",
  BLOCKED: "review.availabilities.BLOCKED",
};

/** The key of `code` in `table`, or `other` for a code the table does not hold (an own property only). */
function keyOf(table: Readonly<Record<string, ListingKey>>, code: string, other: ListingKey): ListingKey {
  return Object.hasOwn(table, code) ? (table[code] as ListingKey) : other;
}

/** Why the viewer may not decide a revision: "You created or edited this revision.". */
export function ineligibilityKey(code: string): ListingKey {
  return keyOf(INELIGIBILITY_KEYS, code, "review.ineligible.unknown");
}

/** One item of the checklist, version 1 (BR-7 items 1, 3, 4, 5, 6). */
export function checkKey(code: string): ListingKey {
  return keyOf(CHECK_KEYS, code, "review.checks.unknown");
}

/** One closed reason of a return for changes. */
export function changeReasonKey(code: string): ListingKey {
  return keyOf(CHANGE_REASON_KEYS, code, "review.changeReasons.unknown");
}

/** The group of a rejection. */
export function rejectionGroupKey(code: string): ListingKey {
  return keyOf(REJECTION_GROUP_KEYS, code, "review.rejectionGroups.unknown");
}

/** The decision a reviewer chooses: "Approve", "Return for changes", "Reject". */
export function outcomeKey(code: string): ListingKey {
  return keyOf(OUTCOME_KEYS, code, "review.outcomes.unknown");
}

/** Which agreement version the revision's terms equal (E06S4-D7). */
export function termsMatchKey(code: string): ListingKey {
  return keyOf(TERMS_MATCH_KEYS, code, "review.termsMatch.unknown");
}

/** The unit's availability as property answers it. */
export function availabilityKey(code: string): ListingKey {
  return keyOf(AVAILABILITY_KEYS, code, "review.availabilities.unknown");
}
