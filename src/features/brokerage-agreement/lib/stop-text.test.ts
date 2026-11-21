import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import {
  channelChoiceText,
  channelText,
  introducedChoiceText,
  introducedText,
  INTRODUCED_VALUES,
  stopErrorKey,
  SUSPENSION_REASONS,
  suspensionReasonChoiceText,
  suspensionReasonText,
  terminationTypeText,
  WITHDRAWAL_CHANNELS,
} from "./stop-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });

describe("stop texts (brokerage-agreement E05-S8, spec section 6, S8-D12, E05S8-P13)", () => {
  it("stopText_everyCode_hasEnglishText: each reason, channel, introduced value and termination type reads its text in a line and as a choice; a code this UI does not know reads another", () => {
    expect(SUSPENSION_REASONS.map((code) => [t(suspensionReasonText(code)), t(suspensionReasonChoiceText(code))])).toEqual([
      ["a complaint", "A complaint"],
      ["suspected fraud", "Suspected fraud"],
      ["a dispute", "A dispute"],
      ["a check is needed", "A check is needed"],
    ]);
    expect(WITHDRAWAL_CHANNELS.map((code) => [t(channelText(code)), t(channelChoiceText(code))])).toEqual([
      ["a phone call", "Phone call"],
      ["a meeting in person", "In person"],
      ["a message", "Message"],
      ["email", "Email"],
      ["another channel", "Other"],
    ]);
    expect(INTRODUCED_VALUES.map((code) => [t(introducedText(code)), t(introducedChoiceText(code))])).toEqual([
      ["yes", "Yes"],
      ["no", "No"],
      ["not known", "Not known"],
    ]);
    expect(["OWNER_WITHDREW", "UNIT_LET", "SUNVIBE_TERMINATED"].map((code) => t(terminationTypeText(code)))).toEqual([
      "The owner withdrew",
      "The unit is let",
      "Sunvibe's decision",
    ]);

    for (const code of ["SOMETHING_NEW", "complaint", "", "toString", undefined]) {
      expect(t(suspensionReasonText(code))).toBe("another reason");
      expect(t(channelText(code))).toBe("another channel");
      expect(t(introducedText(code))).toBe("not known");
      expect(t(terminationTypeText(code))).toBe("Another reason");
    }
  });

  it("stopText_errorKey_eightCodesElseChanged: each refusal code of the stops reads the server's sentence word for word; FORBIDDEN and any other code read that the agreement changed", () => {
    const sentences: [string, string][] = [
      ["AGREEMENT_ASSIGNEE_ONLY", "Only the lead's assigned Sale may do this."],
      ["AGREEMENT_RELEASER_NOT_INDEPENDENT", "Only a manager who is not the lead's assigned Sale may lift the suspension."],
      ["AGREEMENT_TERMINATION_NOT_ALLOWED", "Only a manager may end an agreement as Sunvibe's decision."],
      ["AGREEMENT_NOT_IN_EFFECT", "This agreement is not in effect."],
      ["AGREEMENT_ENDED", "This agreement has ended."],
      ["AGREEMENT_ALREADY_SUSPENDED", "This agreement is already suspended."],
      ["AGREEMENT_NOT_SUSPENDED", "This agreement is not suspended."],
      ["AGREEMENT_TOOK_EFFECT", "This agreement has taken effect: end it instead."],
    ];
    for (const [code, sentence] of sentences) {
      expect(stopErrorKey(code)).toBe(`stop.errors.${code}`);
      expect(t(stopErrorKey(code))).toBe(sentence);
    }
    for (const code of ["FORBIDDEN", "SOMETHING_NEW", "CONCURRENT_MODIFICATION", "", "toString"]) {
      expect(stopErrorKey(code)).toBe("stop.errors.changed");
    }
    expect(t(stopErrorKey("FORBIDDEN"))).toBe("This agreement changed. Read it again.");
  });
});
