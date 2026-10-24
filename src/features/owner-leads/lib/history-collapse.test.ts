import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import type { LeadActivity } from "../types";

import { collapseChecklistSaves, collapsedSavesText } from "./history-collapse";
import type { OwnerLeadsKey } from "./labels";

const translator = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
const t = (key: OwnerLeadsKey, values?: Record<string, string | number>) => translator(key, values);

function save(overrides: Partial<LeadActivity> = {}): LeadActivity {
  return {
    type: "CHECKLIST_SAVED",
    actorUserId: "u-sale",
    actorName: "Sale One",
    referenceId: "cl-2",
    referenceNo: 2,
    referenceDetail: "DIMENSIONS",
    occurredAt: "2026-10-24T02:05:00Z",
    ...overrides,
  };
}

describe("collapseChecklistSaves (survey-checklist A-21)", () => {
  it("collapses a run of three saves by one actor on one checklist into one row that keeps all three", () => {
    const entries = [
      { type: "CHECKLIST_STARTED", actorUserId: "u-sale", referenceId: "cl-2", referenceNo: 2 } as LeadActivity,
      save({ occurredAt: "2026-10-24T02:05:00Z", referenceDetail: "IDENTIFICATION" }),
      save({ occurredAt: "2026-10-24T02:20:00Z" }),
      save({ occurredAt: "2026-10-24T02:40:00Z", referenceDetail: "TERMS" }),
    ];
    const rows = collapseChecklistSaves(entries);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ kind: "entry", entry: entries[0], no: 1 });
    expect(rows[1]).toMatchObject({
      kind: "saves",
      checklistNo: 2,
      count: 3,
      actorName: "Sale One",
      firstAt: "2026-10-24T02:05:00Z",
      lastAt: "2026-10-24T02:40:00Z",
      firstNo: 2,
    });
    expect(rows[1].kind === "saves" && rows[1].entries).toEqual(entries.slice(1));
  });

  it("reads the collapsed line in Vietnam time", () => {
    const [row] = collapseChecklistSaves([
      save({ occurredAt: "2026-10-24T02:05:00Z" }),
      save({ occurredAt: "2026-10-24T02:20:00Z" }),
      save({ occurredAt: "2026-10-24T02:40:00Z" }),
    ]);
    expect(row.kind).toBe("saves");
    if (row.kind !== "saves") return;
    expect(collapsedSavesText(row, t)).toBe("Checklist #2: 3 saves by Sale One (09:05–09:40)");
  });

  it("names an actor without a name as unknown", () => {
    const [row] = collapseChecklistSaves([save({ actorName: null }), save({ actorName: null })]);
    if (row.kind !== "saves") throw new Error("expected saves");
    expect(collapsedSavesText(row, t)).toBe("Checklist #2: 2 saves by Unknown (09:05–09:05)");
  });

  it("breaks the run at another actor, another checklist or another entry type", () => {
    const rows = collapseChecklistSaves([
      save(),
      save(),
      save({ actorUserId: "u-leader", actorName: "Leader" }),
      save({ referenceId: "cl-3", referenceNo: 3 }),
      save({ referenceId: "cl-3", referenceNo: 3 }),
      { type: "NOTE_ADDED", actorUserId: "u-sale", note: "Called" } as LeadActivity,
      save(),
    ]);
    expect(rows.map((row) => (row.kind === "saves" ? `saves:${row.count}:${row.firstNo}` : `entry:${row.no}`))).toEqual([
      "saves:2:1",
      "entry:3",
      "saves:2:4",
      "entry:6",
      "entry:7",
    ]);
  });

  it("leaves a single save and every other entry as they are, numbered in order", () => {
    const entries = [{ type: "SUBMITTED" } as LeadActivity, save(), { type: "ASSIGNED" } as LeadActivity];
    expect(collapseChecklistSaves(entries)).toEqual([
      { kind: "entry", entry: entries[0], no: 1 },
      { kind: "entry", entry: entries[1], no: 2 },
      { kind: "entry", entry: entries[2], no: 3 },
    ]);
  });
});
