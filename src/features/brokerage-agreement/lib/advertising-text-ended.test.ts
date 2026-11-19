import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementAdvertising } from "../types";

import { advertisingReasonText } from "./advertising-text";
import { phraseText, type Translate } from "./version-terms-model";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" }) as unknown as Translate;

const ENDED: BrokerageAgreementAdvertising = { allowed: false, reasonGroups: ["ENDED"], endDate: "2027-12-31" };

describe("advertisingReasonText by the agreement's state (brokerage-agreement E05-S8, S8-D16, UF-5)", () => {
  it("advertisingText_endedByAgreementState_datedOrEnded: ACTIVE, SUSPENDED and EXPIRED name the period's end date; TERMINATED, CANCELLED, null and an unknown state read that the agreement has ended; no state keeps today's line", () => {
    for (const state of ["ACTIVE", "SUSPENDED", "EXPIRED"]) {
      expect(phraseText(t, advertisingReasonText("ENDED", ENDED, state))).toBe("The agreement's period ended on 31 Dec 2027.");
      // Without an end date the plain line, as today.
      expect(phraseText(t, advertisingReasonText("ENDED", { ...ENDED, endDate: null }, state))).toBe("The agreement has ended.");
    }
    for (const state of ["TERMINATED", "CANCELLED", null, "SOMETHING_NEW"]) {
      expect(phraseText(t, advertisingReasonText("ENDED", ENDED, state))).toBe("The agreement has ended.");
    }
    // Not given: today's line, with its date.
    expect(phraseText(t, advertisingReasonText("ENDED", ENDED))).toBe("The agreement's period ended on 31 Dec 2027.");
    expect(phraseText(t, advertisingReasonText("ENDED", ENDED, undefined))).toBe("The agreement's period ended on 31 Dec 2027.");
    // Every other group reads the same line whatever the state.
    for (const state of ["TERMINATED", null]) {
      expect(advertisingReasonText("SUSPENDED", ENDED, state)).toEqual({ key: "advertising.reasons.SUSPENDED" });
      expect(advertisingReasonText("PROPERTY", ENDED, state)).toEqual({ key: "eligibility.reasons.PROPERTY" });
    }
  });
});
