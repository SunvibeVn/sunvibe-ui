import type { ListingDisplayAnswer } from "../types";

import type { ListingKey } from "./revision-text";

type DisplayReasonCode = ListingDisplayAnswer["reasons"][number];

// The display reasons of a put live (listing-publish E06-S6, spec section 6, E06S6-D3, E06S6-P5) to the keys of
// `ListingPublish.publication.reasons`: one English sentence each, naming no value and no person. `Record` over the
// generated union: a code without a key fails typecheck; a code this UI does not know reads `OTHER`, so it is shown and
// never dropped (as E06S1-P9 does). E05's groups under the advertising reason read their existing `reasons.<GROUP>` texts.

const DISPLAY_REASON_KEYS: Record<DisplayReasonCode, ListingKey> = {
  LISTING_STATE: "publication.reasons.LISTING_STATE",
  ADVERTISING_RIGHT: "publication.reasons.ADVERTISING_RIGHT",
  TERMS_NOT_IN_EFFECT: "publication.reasons.TERMS_NOT_IN_EFFECT",
  UNIT_NOT_AVAILABLE: "publication.reasons.UNIT_NOT_AVAILABLE",
  FRESHNESS: "publication.reasons.FRESHNESS",
};

/** The key of the advertising reason, under which the section lists E05's groups. */
export const ADVERTISING_REASON_KEY: ListingKey = DISPLAY_REASON_KEYS.ADVERTISING_RIGHT;

/** Why a revision does not go live now: one sentence per display reason, or "Another condition does not hold.". */
export function displayReasonKey(code: string): ListingKey {
  return Object.hasOwn(DISPLAY_REASON_KEYS, code) ? (DISPLAY_REASON_KEYS[code as DisplayReasonCode] as ListingKey) : "publication.reasons.OTHER";
}
