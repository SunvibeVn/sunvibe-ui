import type en from "@/i18n/messages/en.json";

import type { ReasonGroup } from "../types";

type Messages = typeof en.BrokerageAgreement;

/** Dotted path of every leaf string below a message object. */
type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafPaths<T[K]>}`;
}[keyof T & string];

/** A key of the `BrokerageAgreement` namespace; a path that does not exist in en.json fails `npm run typecheck`. */
export type EligibilityKey = LeafPaths<Messages>;

/** `Record` over the enum: a group without a text fails `npm run typecheck`. */
const REASON_TEXT: Record<ReasonGroup, EligibilityKey> = {
  BASIS: "eligibility.reasons.BASIS",
  PROPERTY: "eligibility.reasons.PROPERTY",
  UNIT: "eligibility.reasons.UNIT",
  OWNER: "eligibility.reasons.OWNER",
};

/** The text of a reason group; a group this UI does not know reads the `OTHER` text, so it is shown and never dropped. */
export function reasonText(group: string): EligibilityKey {
  return Object.hasOwn(REASON_TEXT, group) ? REASON_TEXT[group as ReasonGroup] : "eligibility.reasons.OTHER";
}
