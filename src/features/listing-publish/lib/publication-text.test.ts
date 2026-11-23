import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { displayReasonKey } from "./publication-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });

const REASONS = ["LISTING_STATE", "ADVERTISING_RIGHT", "TERMS_NOT_IN_EFFECT", "UNIT_NOT_AVAILABLE", "FRESHNESS"];

/** The text at a dotted path below `ListingPublish`, or undefined when there is none. */
function textAt(key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (typeof node !== "object" || node === null || !Object.hasOwn(node, part)) return undefined;
    return (node as Record<string, unknown>)[part];
  }, en.ListingPublish);
}

describe("publication texts (listing-publish E06-S6, spec section 6, E06S6-P5)", () => {
  it("displayReasonKey_everyCodeAndUnknown_keysThatExist: each display reason has its own sentence in en.json, worded as E06S6-P5 says; a code this UI does not know reads the fallback", () => {
    expect(REASONS.map(displayReasonKey)).toEqual(REASONS.map((code) => `publication.reasons.${code}`));
    expect(REASONS.map((code) => t(displayReasonKey(code)))).toEqual([
      "The listing is paused or urgently unpublished.",
      "The agreement does not allow advertising now:",
      "The revision's terms are not the terms in effect.",
      "The unit is not available, or its availability needs checking.",
      "No valid freshness confirmation is in date.",
    ]);
    for (const code of ["SOMETHING_NEW", "OTHER", "toString", "__proto__", "freshness", ""]) {
      expect(displayReasonKey(code)).toBe("publication.reasons.OTHER");
    }
    const keys = [...REASONS, "SOMETHING_NEW"].map(displayReasonKey);
    expect(keys.filter((key) => typeof textAt(key) !== "string")).toEqual([]);
    expect(t("publication.reasons.OTHER")).toBe("Another condition does not hold.");
  });
});
