import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { caseGateKey } from "./case-gate-view";

describe("caseGateKey", () => {
  it("case_saleSeesOnlyNeedsCheck: an open, waiting or holding case reads as one fixed sentence", () => {
    expect(caseGateKey({ status: "CASE_OPEN", caseState: "OPEN" })).toBe("caseGate.needsCheck");
    expect(caseGateKey({ status: "CASE_OPEN", caseState: "WAITING" })).toBe("caseGate.needsCheck");
    expect(caseGateKey({ status: "CASE_OPEN", caseState: "DECIDED" })).toBe("caseGate.needsCheck");
    expect(caseGateKey({ status: "OWNER_CONFIRMED", caseState: "OPEN" })).toBe("caseGate.needsCheck");
  });

  it("case_saleSeesOnlyNeedsCheck: the sentence names no property, owner or candidate", () => {
    expect(en.InventoryIntake.caseGate).toEqual({ title: "Manager check", needsCheck: "This intake needs a manager check." });
  });

  it("case_saleSeesOnlyNeedsCheck: a property in dispute reads the same to the Sale: no rival claim shows (BR-21)", () => {
    expect(en.InventoryIntake.errors.disputed).toBe(en.InventoryIntake.errors["duplicate-check"]);
  });

  it("says nothing with no case", () => {
    expect(caseGateKey({ status: "OWNER_CONFIRMED", caseState: "NONE" })).toBeNull();
    expect(caseGateKey({ status: "OWNER_CONFIRMED", caseState: "DECIDED" })).toBeNull();
    expect(caseGateKey({})).toBeNull();
  });
});
