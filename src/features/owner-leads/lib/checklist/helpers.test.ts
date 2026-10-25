import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import type { OwnerLeadsKey } from "../labels";

import { correctionReasons } from "./correction-rule";
import { A, B, emptyContent, ownerMeta, P1, P2, sourced, VISIT } from "./fixtures.test-support";
import { toGroupInput } from "./group-input";
import { earlierChecklist } from "./page-notices";
import { idle, panelEvent, startSave } from "./panel-state";
import { unitPath } from "./unit-path";
import { unitKey } from "./units";
import { unitText } from "./value-text";

const translator = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
const t = (key: OwnerLeadsKey, values?: Record<string, string | number>) => translator(key, values);
const CTX = { spaces: [P1, P2], scope: "PARTS" as const };

describe("unitText (read-only values, compare view, preview)", () => {
  it("reads the state of a unit without a value", () => {
    expect(unitText("area", sourced(), t)).toBe("Not checked");
    expect(unitText("monthlyRent", sourced(), t)).toBe("Not confirmed");
    expect(unitText("availableFrom", sourced(), t)).toBe("Not confirmed");
    expect(unitText("kitchen", { state: "NOT_APPLICABLE", value: null, naReason: "No kitchen" }, t)).toBe("Not applicable: No kitchen");
  });

  it("reads each kind of value", () => {
    expect(unitText("area", sourced("VALUE", 35.5, "MEASURED"), t)).toBe("35.5 m2");
    expect(unitText("bedrooms", sourced("VALUE", 2, "OBSERVED_ON_SITE"), t)).toBe("2");
    expect(unitText("rentalScope", "PARTS", t)).toBe("Separate parts");
    expect(unitText("propertyType", { state: "VALUE", value: "VILLA", naReason: null }, t)).toBe("Villa");
    expect(unitText("fit", { state: "VALUE", value: { assessment: "IN_SCOPE", reason: "Six rooms" }, naReason: null }, t)).toBe(
      "In scope: Six rooms",
    );
    expect(
      unitText("kitchen", { state: "VALUE", value: { result: "NOT_ENTERED", noneObserved: null, note: null, notEnteredReason: "Locked" }, naReason: null }, t),
    ).toBe("Not entered or only partly entered: Locked");
    expect(
      unitText("kitchen", { state: "VALUE", value: { result: "INSPECTED", noneObserved: true, note: null, notEnteredReason: null }, naReason: null }, t),
    ).toBe("Inspected (the whole area): Nothing seen");
    expect(unitText("availableFrom", sourced("VALUE", "2026-11-20", "OWNER_STATED"), t)).toBe("20/11/2026");
    expect(unitText("deposit", sourced("VALUE", { basis: "MONTHS", months: 2, amount: null }, "OBSERVED_ON_SITE"), t)).toBe("2 months");
    expect(unitText("deposit", sourced("VALUE", { basis: "MONTHS", months: 0, amount: null }, "OBSERVED_ON_SITE"), t)).toBe("No deposit");
    expect(unitText("electricity", sourced("VALUE", { basis: "INCLUDED", amount: null, chargeUnit: null, note: null }, "OBSERVED_ON_SITE"), t)).toBe("Included");
    expect(unitText("otherFees", sourced("VALUE", [], "OBSERVED_ON_SITE"), t)).toBe("None");
    expect(unitText("generalNote", "Blue gate", t)).toBe("Blue gate");
    expect(unitText("generalNote", null, t)).toBe("Not checked");
  });
});

describe("unitPath (server JSON paths of a unit, spec 7.3)", () => {
  it("gives the path of each kind of unit in a body", () => {
    const content = emptyContent();
    const dims = toGroupInput("dimensions", content.dimensions, {}, CTX);
    expect(unitPath("dimensions", dims, unitKey.spaceField("dimensions", P2, "area"))).toBe("content.spaces.1.area");
    const terms = toGroupInput("terms", content.terms, {}, CTX);
    expect(unitPath("terms", terms, unitKey.commonTerm("water"))).toBe("content.common.water");
    expect(unitPath("terms", terms, unitKey.override(P1, "water"))).toBe("content.spaces.0.chargeOverrides.water");
    const g1 = toGroupInput("identification", content.identification, {}, CTX);
    expect(unitPath("identification", g1, unitKey.space(P2))).toBe("content.spaces.1");
    expect(unitPath("identification", g1, "identification/generalNote")).toBe("content.generalNote");
    const safety = toGroupInput(
      "safety",
      content.safety,
      { [unitKey.hazard("H1")]: { hazardId: "H1", spaceId: null, previous: null, description: "x", severity: "MINOR", status: "OPEN", statusNote: null, ownerReportedOn: null, receivedByUserId: null, relayBasis: null } },
      CTX,
    );
    expect(unitPath("safety", safety, unitKey.hazard("H1"))).toBe("content.hazards.value.0");
    expect(unitPath("safety", safety, unitKey.hazardList)).toBe("content.hazards");
    expect(unitPath("safety", safety, unitKey.hazard("NOPE"))).toBeNull();
  });
});

describe("panel status machine (spec 6.2, Review Focus 3)", () => {
  it("panelSave_secondClickWhileSaving_isIgnored", () => {
    const first = startSave(idle());
    expect(first.accepted).toBe(true);
    expect(first.state.status).toBe("saving");
    const second = startSave(first.state);
    expect(second.accepted).toBe(false);
    expect(second.state).toBe(first.state);
  });

  it("moves through the four statuses and opens the correction box", () => {
    const saving = startSave(idle()).state;
    expect(panelEvent(saving, { type: "saved" })).toEqual(idle());
    expect(panelEvent(saving, { type: "failed", reason: "network" }).status).toBe("failed");
    const box = panelEvent(saving, { type: "correction", server: true });
    expect(box).toMatchObject({ status: "correction", serverCorrection: true });
    expect(panelEvent(box, { type: "cancel" })).toEqual(idle());
    const problems = panelEvent(saving, { type: "invalid", problems: { "content.egress.value": "required" } });
    expect(problems).toMatchObject({ status: "failed", reason: "invalid", problems: { "content.egress.value": "required" } });
  });
});

describe("earlierChecklist (BR-23 banner)", () => {
  it("finds the newest checklist of an earlier visit of the same cycle", () => {
    const block = {
      appointments: [
        { id: "AP3", appointmentNo: 3, status: "VISITED" as const, intentCycle: 1, checklists: [{ id: "C3", checklistNo: 3 }] },
        { id: "AP2", appointmentNo: 2, status: "VISITED" as const, intentCycle: 1, checklists: [{ id: "C2", checklistNo: 2 }, { id: "C1", checklistNo: 1 }] },
        { id: "AP1", appointmentNo: 1, status: "VISITED" as const, intentCycle: 0, checklists: [{ id: "C0", checklistNo: 0 }] },
      ],
    };
    expect(earlierChecklist(block, { checklistNo: 3, visit: { appointmentNo: 3, intentCycle: 1 } })).toEqual({ appointmentNo: 2, checklistNo: 2 });
    expect(earlierChecklist(block, { checklistNo: 2, visit: { appointmentNo: 2, intentCycle: 1 } })).toBeNull();
  });
});

describe("correctionReasons: the receiver-only change carries the statement's date (BR-27 hint)", () => {
  it("names the date of a re-attributed statement", () => {
    const content = emptyContent();
    const stored = sourced("VALUE", 2, "OWNER_STATED", { confirmedOn: "2026-10-20", receivedByUserId: A });
    content.dimensions.spaces![0].bedrooms = { ...stored, meta: ownerMeta(A, "2026-10-20") } as never;
    const key = unitKey.spaceField("dimensions", P1, "bedrooms");
    const input = toGroupInput("dimensions", content.dimensions, { [key]: { ...stored, receivedByUserId: B } }, CTX);
    expect(correctionReasons("dimensions", content.dimensions, input, B, VISIT, CTX)).toEqual([
      { kind: "heard-by", unitKey: key, name: "Anh Sale", sameStatementOn: "2026-10-20" },
    ]);
  });
});
