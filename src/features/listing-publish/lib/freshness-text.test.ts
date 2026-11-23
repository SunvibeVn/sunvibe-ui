import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { channelKey, outcomeKey } from "./freshness-text";

/** The text at a dotted path below `ListingPublish`, or undefined when there is none. */
function textAt(key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (typeof node !== "object" || node === null || !Object.hasOwn(node, part)) return undefined;
    return (node as Record<string, unknown>)[part];
  }, en.ListingPublish);
}

describe("freshness texts (listing-publish E06-S3, spec section 6)", () => {
  it("freshnessText_everyCode_hasAnEnglishKey: every channel and result reads its English text; an unknown code its fallback", () => {
    expect([
      ...["CALL", "MESSAGE", "IN_PERSON", "FAX"].map((code) => textAt(channelKey(code))),
      ...["AVAILABLE", "NOT_AVAILABLE", "UNREACHABLE", "MAYBE"].map((code) => textAt(outcomeKey(code))),
    ]).toEqual([
      "Phone call",
      "Message",
      "In person",
      "Another channel",
      "Still available",
      "No longer available",
      "Could not reach",
      "Another result",
    ]);
  });
});
