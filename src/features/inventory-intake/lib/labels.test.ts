import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import {
  GATE_REASON_LABEL,
  MISSING_FOR_BROKERAGE_LABEL,
  READINESS_REASON_LABEL,
  READINESS_STATE_LABEL,
  UNIT_REASON_LABEL,
} from "./labels";

const t = createTranslator({ locale: "en", messages: en, namespace: "InventoryIntake" });

describe("intake labels", () => {
  it("labels_everyGateReason: every gate reason of the contract reads as words", () => {
    const reasons = [
      "NOT_LONG_TERM",
      "NOT_QUALIFIED",
      "NO_PASSED",
      "PASSED_NOT_USABLE",
      "TYPE_SCOPE_MISMATCH",
      "RECONCILIATION_REQUIRED",
      "RESTRICTED",
    ];
    expect(Object.keys(GATE_REASON_LABEL).sort()).toEqual([...reasons].sort());
    for (const key of Object.values(GATE_REASON_LABEL)) expect(t(key)).toMatch(/^[A-Z].*\.$/);
  });

  it("labels_everyReadinessReason: every readiness state and reason of the contract reads as words", () => {
    const reasons = [
      "LEAD_ON_HOLD",
      "EVIDENCE_HELD",
      "OWNER_NOT_CONFIRMED",
      "OWNER_NOT_ELIGIBLE",
      "RESTRICTED",
      "DUPLICATE",
      "REJECTED",
      "WITHDRAWN",
      "REQUALIFIED",
      "INTENT_CHANGED",
      "EVIDENCE_GONE",
    ];
    expect(Object.keys(READINESS_REASON_LABEL).sort()).toEqual([...reasons].sort());
    expect(Object.keys(READINESS_STATE_LABEL).sort()).toEqual(["ENDED", "NONE", "SUSPENDED", "USABLE"]);
    expect(Object.keys(UNIT_REASON_LABEL).sort()).toEqual(["AVAILABILITY_DIFFERS", "RESTRICTED"]);
    expect(Object.keys(MISSING_FOR_BROKERAGE_LABEL).sort()).toEqual([
      "ADVERTISING_PERMISSION",
      "AGREEMENT",
      "CONFIRMED_TERMS",
      "PHOTO_RIGHTS",
    ]);
    const keys = [
      ...Object.values(READINESS_REASON_LABEL),
      ...Object.values(READINESS_STATE_LABEL),
      ...Object.values(UNIT_REASON_LABEL),
      ...Object.values(MISSING_FOR_BROKERAGE_LABEL),
    ];
    for (const key of keys) expect(t(key)).not.toBe("");
  });

  it("labels_everyReadinessReason: a restricted lead reads with no free text in the label", () => {
    expect(t(READINESS_REASON_LABEL.RESTRICTED)).toBe("Restricted by a manager.");
  });
});
