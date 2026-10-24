import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import type { OwnerLeadsKey } from "../labels";

import { compareRows, unitLabel } from "./compare-view";
import { emptyContent, P1, P2, siteMeta, sourced } from "./fixtures.test-support";
import { inputOfContent, unitsOfInput } from "./group-input";
import { saveFailureEvent } from "./panel-state";
import { unitKey } from "./units";

const translator = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
const t = (key: OwnerLeadsKey, values?: Record<string, string | number>) => translator(key, values);
const CODES = new Map([
  [P1, "P1"],
  [P2, "P2"],
]);

describe("saveFailureEvent (spec 6.3 for a panel)", () => {
  it("opens the correction box on a 400 that names correction (also for an entry put back, A-29)", () => {
    expect(saveFailureEvent({ kind: "correction-required", fieldErrors: { correction: "x" } })).toEqual({ type: "correction", server: true });
  });

  it("puts the other 400 fields on their paths and keeps the edits", () => {
    expect(saveFailureEvent({ kind: "validation", fieldErrors: { "content.spaces.0.area.value": "x" } })).toEqual({
      type: "invalid",
      problems: { "content.spaces.0.area.value": "server" },
      reason: "server",
    });
    expect(saveFailureEvent({ kind: "form" })).toEqual({ type: "failed", reason: "server" });
  });

  it("says which group changed on a 409 (spec 6.3); the page reads again and the compare view follows", () => {
    expect(saveFailureEvent({ kind: "stale", staleGroup: null })).toEqual({ type: "failed", reason: "stale", staleGroup: null });
    expect(saveFailureEvent({ kind: "stale", staleGroup: "terms" })).toEqual({ type: "failed", reason: "stale", staleGroup: "terms" });
  });

  it("says why a save failed otherwise", () => {
    expect(saveFailureEvent({ kind: "retry" })).toEqual({ type: "failed", reason: "network" });
    expect(saveFailureEvent({ kind: "surveyor-ineligible" })).toEqual({ type: "failed", reason: "ineligible" });
    expect(saveFailureEvent({ kind: "forbidden" })).toEqual({ type: "failed", reason: "forbidden" });
    expect(saveFailureEvent({ kind: "signed-out" })).toEqual({ type: "cancel" });
  });
});

describe("compareRows (W16-27: a 409 shows both versions)", () => {
  it("lists each edited unit with the newly saved value next to the user's", () => {
    const content = emptyContent();
    content.dimensions.spaces![0].area = { ...sourced("VALUE", 40, "MEASURED"), meta: siteMeta() } as never;
    const stored = unitsOfInput("dimensions", inputOfContent("dimensions", content.dimensions, { spaces: [P1, P2], scope: "PARTS" }));
    const rows = compareRows({ [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 35, "MEASURED") }, stored, CODES, t);
    expect(rows).toEqual([{ key: unitKey.spaceField("dimensions", P1, "area"), label: "P1 · Area (m2)", savedNow: "40 m2", yours: "35 m2" }]);
  });

  it("reads a removed entry and an added one", () => {
    const stored = new Map<string, unknown>([[unitKey.otherItem("X1"), { itemId: "X1", label: "Fan", presence: "YES" }]]);
    const rows = compareRows(
      { [unitKey.otherItem("X1")]: null, [unitKey.otherItem("X2")]: { itemId: "X2", label: "Heater", presence: "NO" } },
      stored,
      CODES,
      t,
    );
    expect(rows.map((row) => [row.savedNow, row.yours])).toEqual([
      ["Fan: Yes", "Removed"],
      ["Nothing", "Heater: No"],
    ]);
  });

  it("names units for the Not kept list", () => {
    expect(unitLabel(unitKey.spaceField("terms", P2, "monthlyRent"), CODES, t)).toBe("P2 · Monthly rent (VND)");
    expect(unitLabel(unitKey.override(P1, "water"), CODES, t)).toBe("P1 · Water (Different for this space)");
    expect(unitLabel("condition/sharedKitchen", CODES, t)).toBe("Shared kitchen");
    expect(unitLabel(unitKey.sharedItem("BED"), CODES, t)).toBe("Bed");
  });
});
