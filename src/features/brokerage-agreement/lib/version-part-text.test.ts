import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { versionPartText } from "./version-part-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });

describe("versionPartText (brokerage-agreement E05-S4, S4-D5, S4-D11)", () => {
  it("versionPartText_everyPath_hasText: each part a send can miss, in S4-D5's order, reads its text", () => {
    const parts: [string, string][] = [
      ["photoConsent", "Public photos of the interior"],
      ["terms.monthlyRent", "Monthly rent"],
      ["terms.deposit", "Deposit"],
      ["terms.minimumTermMonths", "Minimum term"],
      ["terms.paymentPeriodMonths", "Payment period"],
      ["terms.mandatoryFees", "Mandatory fees"],
      ["feePolicy.formula", "How the fee is set"],
      ["feePolicy.dueDays", "Payment due"],
      ["feePolicy.renewal", "Lease renewed with the same tenant"],
      ["feePolicy.earlyLeaseEnd", "If the lease ends early"],
      ["feePolicy.protectionDays", "Protection period"],
    ];
    for (const [path, text] of parts) expect(t(versionPartText(path))).toBe(text);
    expect(new Set(parts.map(([path]) => versionPartText(path))).size).toBe(parts.length);
  });

  it("versionPartText_unknownPath_anotherPart: a part this UI does not know is shown, never dropped", () => {
    for (const path of ["feePolicy.payer", "terms", "toString", ""]) {
      expect(versionPartText(path)).toBe("send.part.OTHER");
    }
    expect(t("send.part.OTHER")).toBe("Another part");
  });
});
