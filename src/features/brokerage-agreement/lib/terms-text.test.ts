import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { AdvertisingScope, ChargeUnit, FeeBasis, TermSourceCode } from "../types";

import { advertisingScopeText, amountText, chargeUnitText, feeLineKey, termSourceText } from "./terms-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });

describe("terms texts (brokerage-agreement E05-S3, BR-8, BR-9, S3-D12)", () => {
  it("termsText_everyCode_hasEnglishText: every charge unit, fee basis, survey source and advertising scope reads its text", () => {
    const units: [ChargeUnit, string][] = [
      ["PER_MONTH", "per month"],
      ["PER_KWH", "per kWh"],
      ["PER_M3", "per m³"],
      ["PER_PERSON_PER_MONTH", "per person per month"],
      ["PER_VEHICLE_PER_MONTH", "per vehicle per month"],
      ["ONE_OFF", "one-off"],
    ];
    for (const [code, text] of units) {
      expect(chargeUnitText(code)).toBe(`terms.chargeUnit.${code}`);
      expect(t(chargeUnitText(code))).toBe(text);
    }

    const fees: [FeeBasis, string][] = [
      ["AMOUNT", "Water: 3,500 VND per m³"],
      ["INCLUDED", "Water: included in the rent"],
      ["PROVIDER_TARIFF", "Water: provider's rate"],
    ];
    for (const [basis, text] of fees) {
      expect(feeLineKey(basis)).toBe(`terms.fee.${basis}`);
      expect(t(feeLineKey(basis), { name: "Water", amount: "3,500", unit: t("terms.chargeUnit.PER_M3") })).toBe(text);
    }

    const sources: [TermSourceCode, string][] = [
      ["OBSERVED_ON_SITE", "Seen on site"],
      ["OWNER_STATED", "Said by the owner"],
      ["OWNER_FORM", "Owner's web form"],
    ];
    for (const [code, text] of sources) {
      expect(termSourceText(code)).toBe(`survey.source.${code}`);
      expect(t(termSourceText(code))).toBe(text);
    }
    expect(t(termSourceText(null))).toBe("Source not recorded");
    expect(t(termSourceText(undefined))).toBe("Source not recorded");

    const scopes: [AdvertisingScope, string][] = [
      [
        "SUNVIBE_CHANNELS",
        "Sunvibe may advertise this unit on sunvibe.vn and by staff sending the listing link to customers, from the start date to the end date. Outside channels such as social networks, classified sites or other platforms are not included.",
      ],
    ];
    for (const [code, text] of scopes) {
      expect(advertisingScopeText(code)).toBe(`terms.advertisingScope.${code}`);
      expect(t(advertisingScopeText(code))).toBe(text);
    }
  });

  it("termsText_unknownCode_other: a code this UI does not know reads its OTHER text, never dropped", () => {
    expect(t(chargeUnitText("PER_WEEK"))).toBe("per another unit");
    expect(t(feeLineKey("WAIVED"), { name: "Water" })).toBe("Water: another kind of fee");
    expect(t(termSourceText("NEIGHBOUR"))).toBe("Another source");
    expect(t(advertisingScopeText("SOCIAL_NETWORKS"))).toBe("Another advertising permission.");
    expect(chargeUnitText("toString")).toBe("terms.chargeUnit.OTHER");
  });

  it("amountText_wholeVnd_groupedWithCommas: a whole amount of VND reads with comma groups, exactly", () => {
    expect(amountText(8000000)).toBe("8,000,000");
    expect(amountText(0)).toBe("0");
    expect(amountText(999999999999999)).toBe("999,999,999,999,999");
  });
});
