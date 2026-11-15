import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { reasonText } from "./reason-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });

describe("reasonText (brokerage-agreement E05-S1, spec section 6)", () => {
  it("reasonText_everyGroup_hasEnglishText: each reason group reads its own sentence", () => {
    const table: [string, string, string][] = [
      ["BASIS", "eligibility.reasons.BASIS", "The intake result of this lead is not usable now."],
      ["PROPERTY", "eligibility.reasons.PROPERTY", "Stopped for the whole property."],
      ["UNIT", "eligibility.reasons.UNIT", "Stopped for this unit."],
      [
        "OWNER",
        "eligibility.reasons.OWNER",
        "The owner on record does not meet the conditions: one current owner, the declared owner, an individual whose account can sign in and holds no staff role.",
      ],
    ];
    for (const [group, key, text] of table) {
      expect(reasonText(group)).toBe(key);
      expect(t(reasonText(group))).toBe(text);
    }
  });

  it("reasonText_unknownGroup_other: a group this UI does not know is shown, never dropped", () => {
    expect(reasonText("NEW_GROUP")).toBe("eligibility.reasons.OTHER");
    expect(t(reasonText("NEW_GROUP"))).toBe("Another reason stops it.");
  });
});
