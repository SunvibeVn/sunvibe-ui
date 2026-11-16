import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { agreementStatusText, transactionTypeText, versionStatusText } from "./status-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });

describe("status texts (brokerage-agreement E05-S2, BR-5, S2-D4)", () => {
  it("statusText_everyCode_hasEnglishText: each state of an agreement and of a version, and the type, reads its text", () => {
    const agreements: [string, string][] = [
      ["DRAFTING", "Drafting"],
      ["AWAITING_CONFIRMATION", "Awaiting confirmation"],
      ["ACTIVE", "Active"],
      ["SUSPENDED", "Suspended"],
      ["EXPIRED", "Expired"],
      ["TERMINATED", "Terminated"],
      ["CANCELLED", "Cancelled"],
    ];
    for (const [code, text] of agreements) {
      expect(agreementStatusText(code)).toBe(`status.${code}`);
      expect(t(agreementStatusText(code))).toBe(text);
    }

    const versions: [string, string][] = [
      ["DRAFT", "Draft"],
      ["AWAITING_OWNER", "Awaiting the owner"],
      ["OWNER_CONFIRMED", "Confirmed by the owner"],
      ["ACTIVATED", "Activated"],
      ["EFFECTIVE", "In effect"],
      ["SUPERSEDED", "Superseded"],
      ["OWNER_REJECTED", "Rejected by the owner"],
      ["LAPSED", "Lapsed"],
      ["ACTIVATION_REFUSED", "Activation refused"],
      ["CANCELLED", "Cancelled"],
    ];
    for (const [code, text] of versions) {
      expect(versionStatusText(code)).toBe(`versionStatus.${code}`);
      expect(t(versionStatusText(code))).toBe(text);
    }

    expect(transactionTypeText("LONG_TERM_RENT")).toBe("transactionType.LONG_TERM_RENT");
    expect(t(transactionTypeText("LONG_TERM_RENT"))).toBe("Long-term rental");
  });

  it("statusText_unknownCode_other: a code this UI does not know is shown, never dropped", () => {
    expect(agreementStatusText("PAUSED")).toBe("status.OTHER");
    expect(t(agreementStatusText("PAUSED"))).toBe("Another state");
    expect(versionStatusText("PAUSED")).toBe("versionStatus.OTHER");
    expect(t(versionStatusText("PAUSED"))).toBe("Another state");
    expect(transactionTypeText("SALE")).toBe("transactionType.OTHER");
    expect(t(transactionTypeText("SALE"))).toBe("Another transaction type");
    expect(agreementStatusText("toString")).toBe("status.OTHER");
  });
});
