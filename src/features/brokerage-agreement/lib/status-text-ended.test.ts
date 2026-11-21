import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { versionBadgeText, versionStatusText } from "./status-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });

const VERSION_STATES = [
  "DRAFT",
  "AWAITING_OWNER",
  "OWNER_CONFIRMED",
  "ACTIVATED",
  "EFFECTIVE",
  "SUPERSEDED",
  "OWNER_REJECTED",
  "LAPSED",
  "ACTIVATION_REFUSED",
  "CANCELLED",
  "SOMETHING_NEW",
];
const AGREEMENT_STATES = ["DRAFTING", "AWAITING_CONFIRMATION", "ACTIVE", "SUSPENDED", "EXPIRED", "TERMINATED", "CANCELLED", "SOMETHING_NEW"];

describe("versionBadgeText (brokerage-agreement E05-S8, S8-D16, E05S8-P11, UF-5)", () => {
  it("versionBadgeText_effectiveOfExpiredOrTerminated_ended: an EFFECTIVE version of an EXPIRED or TERMINATED agreement reads Ended with the agreement", () => {
    for (const agreementStatus of ["EXPIRED", "TERMINATED"]) {
      expect(versionBadgeText("EFFECTIVE", agreementStatus)).toBe("versionStatus.ENDED");
    }
    expect(t(versionBadgeText("EFFECTIVE", "EXPIRED"))).toBe("Ended with the agreement");
  });

  it("versionBadgeText_otherPairs_todaysKey: every other pair, and a version without the agreement's state, keeps the version's own text", () => {
    for (const versionStatus of VERSION_STATES) {
      for (const agreementStatus of [...AGREEMENT_STATES, null, undefined]) {
        if (versionStatus === "EFFECTIVE" && (agreementStatus === "EXPIRED" || agreementStatus === "TERMINATED")) continue;
        expect(versionBadgeText(versionStatus, agreementStatus)).toBe(versionStatusText(versionStatus));
      }
    }
    expect(t(versionBadgeText("EFFECTIVE", "ACTIVE"))).toBe("In effect");
    expect(t(versionBadgeText("CANCELLED", "TERMINATED"))).toBe("Cancelled");
  });
});
