import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { chargedWhenText, earlyLeaseEndText, formulaTypeText, payerText } from "./fee-policy-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });

describe("fee policy texts (brokerage-agreement E05-S4, BR-7, S4-D3)", () => {
  it("feePolicyText_everyCode_hasEnglishText: each code of the fee policy reads its text", () => {
    const formulas: [string, string][] = [
      ["PERCENT_OF_RENT", "Percentage of one month's rent"],
      ["FIXED_AMOUNT", "Fixed amount"],
      ["FREE", "Free of charge"],
      ["NOT_CHARGED", "No fee"],
    ];
    for (const [code, text] of formulas) {
      expect(formulaTypeText(code)).toBe(`fee.formula.${code}`);
      expect(t(formulaTypeText(code))).toBe(text);
    }

    const refunds: [string, string][] = [
      ["NO_REFUND", "No refund"],
      ["PARTIAL_REFUND", "Partial refund"],
    ];
    for (const [code, text] of refunds) {
      expect(earlyLeaseEndText(code)).toBe(`fee.earlyLeaseEnd.${code}`);
      expect(t(earlyLeaseEndText(code))).toBe(text);
    }

    expect(payerText("OWNER")).toBe("fee.payer.OWNER");
    expect(t(payerText("OWNER"))).toBe("The owner");
    expect(chargedWhenText("LEASE_SIGNED")).toBe("fee.chargedWhen.LEASE_SIGNED");
    expect(t(chargedWhenText("LEASE_SIGNED"))).toBe("When a lease is signed");
  });

  it("feePolicyText_unknownCode_other: a code this UI does not know is shown, never dropped", () => {
    expect(formulaTypeText("MONTHLY")).toBe("fee.formula.OTHER");
    expect(t(formulaTypeText("MONTHLY"))).toBe("Another way of setting the fee");
    expect(earlyLeaseEndText("FULL_REFUND")).toBe("fee.earlyLeaseEnd.OTHER");
    expect(t(earlyLeaseEndText("FULL_REFUND"))).toBe("Another refund rule");
    expect(payerText("TENANT")).toBe("fee.payer.OTHER");
    expect(t(payerText("TENANT"))).toBe("Another payer");
    expect(chargedWhenText("MOVE_IN")).toBe("fee.chargedWhen.OTHER");
    expect(t(chargedWhenText("MOVE_IN"))).toBe("At another moment");
    expect(formulaTypeText("toString")).toBe("fee.formula.OTHER");
    for (const text of ["Another way of setting the fee", "Another refund rule", "Another payer", "At another moment"]) {
      expect(text).not.toBe("Another state");
    }
  });
});
