import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { listingStateKey, reasonGroupKey, revisionStatusKey, transactionTypeKey } from "./listing-text";

const STATES = ["UNPUBLISHED", "PUBLISHED", "PAUSED", "URGENTLY_UNPUBLISHED", "ARCHIVED"];
const REVISION_STATUSES = ["DRAFT", "PENDING_REVIEW", "NEEDS_CHANGES", "REJECTED", "APPROVED", "LIVE", "REPLACED", "CANCELLED"];
const REASON_GROUPS = ["NO_AGREEMENT", "NOT_IN_EFFECT", "NOT_STARTED", "SUSPENDED", "ENDED", "BASIS", "PROPERTY", "UNIT", "OWNER"];
const UNKNOWN = ["NEW_CODE", "unpublished", ""];

/** The text at a dotted path below `ListingPublish`, or undefined when there is none. */
function textAt(key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (typeof node !== "object" || node === null || !Object.hasOwn(node, part)) return undefined;
    return (node as Record<string, unknown>)[part];
  }, en.ListingPublish);
}

describe("listing texts (listing-publish E06-S1, spec section 6, E06S1-P9)", () => {
  it("listingText_knownCodes_theirKeys: each state, revision status, transaction type and reason group has its own key", () => {
    expect(STATES.map(listingStateKey)).toEqual(STATES.map((code) => `states.${code}`));
    expect(REVISION_STATUSES.map(revisionStatusKey)).toEqual(REVISION_STATUSES.map((code) => `revisionStatuses.${code}`));
    expect(transactionTypeKey("LONG_TERM_RENT")).toBe("transactionTypes.LONG_TERM_RENT");
    expect(REASON_GROUPS.map(reasonGroupKey)).toEqual(REASON_GROUPS.map((code) => `reasons.${code}`));
  });

  it("listingText_unknownCodes_fallbackKeys: a code this UI does not know reads its fallback, never dropped", () => {
    for (const code of [...UNKNOWN, "OTHER", "toString", "__proto__"]) {
      expect(listingStateKey(code)).toBe("states.OTHER");
      expect(revisionStatusKey(code)).toBe("revisionStatuses.OTHER");
      expect(transactionTypeKey(code)).toBe("transactionTypes.OTHER");
      expect(reasonGroupKey(code)).toBe("reasons.OTHER");
    }
  });

  it("listingText_everyKey_inEnJson: every key the four functions can answer has a text, the fallbacks those of E06S1-P9", () => {
    const keys = [
      ...[...STATES, ...UNKNOWN].map(listingStateKey),
      ...[...REVISION_STATUSES, ...UNKNOWN].map(revisionStatusKey),
      ...["LONG_TERM_RENT", ...UNKNOWN].map(transactionTypeKey),
      ...[...REASON_GROUPS, ...UNKNOWN].map(reasonGroupKey),
    ];
    const missing = keys.filter((key) => typeof textAt(key) !== "string");
    expect(missing).toEqual([]);

    expect(textAt("states.OTHER")).toBe("Another state");
    expect(textAt("revisionStatuses.OTHER")).toBe("Another state");
    expect(textAt("transactionTypes.OTHER")).toBe("Another transaction type");
    expect(textAt("reasons.OTHER")).toBe("Another reason stops it.");
    expect(STATES.map((code) => textAt(listingStateKey(code)))).toEqual([
      "Unpublished",
      "Published",
      "Paused",
      "Urgently unpublished",
      "Archived",
    ]);
    expect(REVISION_STATUSES.map((code) => textAt(revisionStatusKey(code)))).toEqual([
      "Draft",
      "Pending review",
      "Needs changes",
      "Rejected",
      "Approved",
      "Live",
      "Replaced",
      "Cancelled",
    ]);
    expect(textAt(transactionTypeKey("LONG_TERM_RENT"))).toBe("Long-term rental");
  });
});
