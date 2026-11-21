import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import {
  availabilityKey,
  changeReasonKey,
  checkKey,
  ineligibilityKey,
  outcomeKey,
  rejectionGroupKey,
  termsMatchKey,
} from "./review-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });

const INELIGIBILITIES = ["NOT_A_REVIEWER", "AUTHOR", "ASSIGNED_SALE", "NOT_PENDING", "LISTING_ARCHIVED"];
const CHECKS = ["CONTENT_MATCHES_UNIT", "TEXT_FOLLOWS_RULES", "TERMS_MATCH_AGREEMENT", "NO_FRAUD_SIGNS", "AGREEMENT_END_AND_RIGHT"];
const CHANGE_REASONS = ["CONTENT_MISMATCH", "TEXT_RULE_VIOLATION", "MISSING_INFORMATION", "TERMS_MISMATCH", "OTHER"];
const REJECTION_GROUPS = ["SUSPECTED_FRAUD", "WRONG_UNIT", "SERIOUS_VIOLATION", "OTHER"];
const OUTCOMES = ["APPROVED", "NEEDS_CHANGES", "REJECTED"];
const TERMS_MATCHES = ["IN_EFFECT", "PENDING_START", "NONE", "NO_SNAPSHOT"];
const AVAILABILITIES = ["AVAILABLE", "OCCUPIED", "MAINTENANCE", "BLOCKED"];

describe("review texts (listing-publish E06-S4, spec section 6, E06S4-P13)", () => {
  it("reviewText_everyCode_keyInEnJson: each code of the contract has its own English text, worded as the spec and E06S4-P13 say", () => {
    expect(INELIGIBILITIES.map((code) => t(ineligibilityKey(code)))).toEqual([
      "You do not hold a listing reviewer role.",
      "You created or edited this revision.",
      "You are the listing's assigned Sale.",
      "This revision is no longer waiting for review.",
      "The listing is archived.",
    ]);
    expect(CHECKS.map((code) => t(checkKey(code)))).toEqual([
      "Text, features and terms match the unit (type, rooms, area, features).",
      "The text follows the listing rules, including what the machine check cannot catch (numbers in words, street names, house numbers, people's names, prices); so do the fee names of the terms.",
      "Rent, deposit and every mandatory fee, with its name, equal the agreement version (compared above).",
      "No sign of a fake listing or of content taken from elsewhere.",
      "The agreement's end and the current advertising right were checked.",
    ]);
    expect(CHANGE_REASONS.map((code) => t(changeReasonKey(code)))).toEqual([
      "The content does not match the unit.",
      "The text breaks the listing rules.",
      "Information is missing.",
      "The rental terms do not match the agreement version.",
      "Other (say what in the note).",
    ]);
    expect(REJECTION_GROUPS.map((code) => t(rejectionGroupKey(code)))).toEqual([
      "Suspected fake listing or fraud.",
      "Wrong unit.",
      "Serious violation.",
      "Other (say what in the note).",
    ]);
    expect(OUTCOMES.map((code) => t(outcomeKey(code)))).toEqual(["Approve", "Return for changes", "Reject"]);
    expect(TERMS_MATCHES.map((code) => t(termsMatchKey(code)))).toEqual([
      "The revision's terms equal the version in effect.",
      "The revision's terms equal the version waiting to start.",
      "The revision's terms equal no version of the agreement: it cannot be approved.",
      "This revision holds no terms snapshot.",
    ]);
    expect(AVAILABILITIES.map((code) => t(availabilityKey(code)))).toEqual(["Available", "Occupied", "Maintenance", "Blocked"]);
  });

  it("reviewText_unknownCode_fallbackKey: a code this UI does not know reads its fallback text, never the code; an inherited name is not a code", () => {
    for (const code of ["SOMETHING_NEW", "toString", "__proto__", ""]) {
      expect(ineligibilityKey(code)).toBe("review.ineligible.unknown");
      expect(checkKey(code)).toBe("review.checks.unknown");
      expect(changeReasonKey(code)).toBe("review.changeReasons.unknown");
      expect(rejectionGroupKey(code)).toBe("review.rejectionGroups.unknown");
      expect(outcomeKey(code)).toBe("review.outcomes.unknown");
      expect(termsMatchKey(code)).toBe("review.termsMatch.unknown");
      expect(availabilityKey(code)).toBe("review.availabilities.unknown");
    }
    // OTHER is a code of the reasons and the groups, not of the eligibility.
    expect(ineligibilityKey("OTHER")).toBe("review.ineligible.unknown");
    expect(changeReasonKey("OTHER")).toBe("review.changeReasons.OTHER");
    expect(rejectionGroupKey("OTHER")).toBe("review.rejectionGroups.OTHER");
    expect(
      [
        ineligibilityKey("X"),
        checkKey("X"),
        changeReasonKey("X"),
        rejectionGroupKey("X"),
        outcomeKey("X"),
        termsMatchKey("X"),
        availabilityKey("X"),
      ].map((key) => t(key)),
    ).toEqual([
      "Another reason stops it.",
      "A check this page does not know yet.",
      "Another reason.",
      "Another group.",
      "Another decision",
      "The terms check gave an answer this page does not know.",
      "Another state",
    ]);
  });
});
