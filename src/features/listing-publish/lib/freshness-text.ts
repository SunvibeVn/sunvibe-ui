import type { ListingFreshnessRecord } from "../types";

import type { ListingKey } from "./revision-text";

type ChannelCode = ListingFreshnessRecord["channel"];
type OutcomeCode = ListingFreshnessRecord["outcome"];

// Keys of the `ListingPublish` namespace below `freshness`. A code this UI does not know reads its `OTHER` text, so it is
// shown and never dropped (as E06S1-P9 does for the listing's codes).

const CHANNEL_KEYS: Record<ChannelCode, ListingKey> = {
  CALL: "freshness.channels.CALL",
  MESSAGE: "freshness.channels.MESSAGE",
  IN_PERSON: "freshness.channels.IN_PERSON",
};

const OUTCOME_KEYS: Record<OutcomeCode, ListingKey> = {
  AVAILABLE: "freshness.outcomes.AVAILABLE",
  NOT_AVAILABLE: "freshness.outcomes.NOT_AVAILABLE",
  UNREACHABLE: "freshness.outcomes.UNREACHABLE",
};

function keyOf(table: Readonly<Record<string, ListingKey>>, code: string, other: ListingKey): ListingKey {
  return Object.hasOwn(table, code) ? (table[code] as ListingKey) : other;
}

/** How the person letting the unit was contacted: "Phone call", "Message", "In person". */
export function channelKey(code: string): ListingKey {
  return keyOf(CHANNEL_KEYS, code, "freshness.channels.OTHER");
}

/** The result of the contact: "Still available", "No longer available", "Could not reach". */
export function outcomeKey(code: string): ListingKey {
  return keyOf(OUTCOME_KEYS, code, "freshness.outcomes.OTHER");
}
