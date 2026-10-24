import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import type { OwnerLeadsKey } from "../labels";

import { B, C, ownerMeta, siteMeta, VISIT } from "./fixtures.test-support";
import { formatProvenance, provenanceLine } from "./provenance-line";

const translator = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });
const t = (key: OwnerLeadsKey, values?: Record<string, string | number>) => translator(key, values);
const read = (...args: Parameters<typeof provenanceLine>) => formatProvenance(provenanceLine(...args), t);

const CORRECTIONS = [
  { saveId: "77", group: "DIMENSIONS" as const, units: [], reason: "Remeasured the room", basis: { confirmedOn: "2026-10-24", text: "x" }, actorUserId: B, actorName: "Binh Leader", savedAt: "2026-10-24T03:00:00Z" },
];

describe("provenanceLine (spec 6.2)", () => {
  it("reads an on-site value as seen at the survey by the performer, then who entered it", () => {
    expect(read({ state: "VALUE", source: "OBSERVED_ON_SITE" }, siteMeta(), VISIT, [])).toEqual([
      "Seen on site at survey #1 by Anh Sale, 23/10/2026",
      "entered by Anh Sale 23/10 11:00",
    ]);
  });

  it("reads an unsourced value as seen on site", () => {
    expect(read({ state: "VALUE", source: null }, siteMeta({ lastSource: null }), VISIT, [])[0]).toBe(
      "Seen on site at survey #1 by Anh Sale, 23/10/2026",
    );
  });

  it("names a measured or estimated value by its source", () => {
    expect(read({ state: "VALUE", source: "MEASURED" }, siteMeta({ lastSource: "MEASURED" }), VISIT, [])[0]).toBe(
      "Measured at survey #1 by Anh Sale, 23/10/2026",
    );
    expect(read({ state: "VALUE", source: "ESTIMATED" }, siteMeta({ lastSource: "ESTIMATED" }), VISIT, [])[0]).toBe(
      "Estimated at survey #1 by Anh Sale, 23/10/2026",
    );
  });

  it("reads an owner statement with who heard it and how it reached the person entering it", () => {
    expect(
      read({ state: "VALUE", source: "OWNER_STATED", relayBasis: "Call note of 20/10" }, ownerMeta(C, "2026-10-20", B), VISIT, [])[0],
    ).toBe("Owner said on 20/10/2026 (heard by Chi Manager; passed on: Call note of 20/10)");
    expect(read({ state: "VALUE", source: "OWNER_STATED", relayBasis: null }, ownerMeta(B, "2026-10-20", B), VISIT, [])[0]).toBe(
      "Owner said on 20/10/2026 (heard by Binh Leader)",
    );
  });

  it("reads an owner's form value with its submission date", () => {
    const meta = siteMeta({ observedByUserId: null, observedByName: null, observedOn: "2026-10-01", lastSource: "OWNER_FORM", formField: "address" });
    expect(read({ state: "VALUE", source: "OWNER_FORM" }, meta, VISIT, [])[0]).toBe("Owner's form, submitted 01/10/2026");
  });

  it("reads a note as the writer's note, never as seen on site", () => {
    const meta = siteMeta({ observedByUserId: null, observedByName: null, observedOn: null, lastSource: null, enteredByName: "Binh Leader" });
    const lines = read({ state: "VALUE", note: true }, meta, VISIT, []);
    expect(lines).toEqual(["Note by Binh Leader, 23/10/2026"]);
    expect(lines.join(" ")).not.toContain("Seen on site");
  });

  it("reads an area-check note as not a check", () => {
    expect(read({ state: "VALUE", note: true, notACheck: true }, siteMeta(), VISIT, [])).toEqual([
      "Note by Anh Sale, 23/10/2026 (not a check)",
    ]);
  });

  it("reads a cleared unit with who cleared it and its earlier line", () => {
    const meta = siteMeta({ enteredByUserId: B, enteredByName: "Binh Leader", enteredAt: "2026-10-24T05:30:00Z" });
    expect(read({ state: "UNKNOWN", source: null }, meta, VISIT, [])).toEqual([
      "Cleared by Binh Leader 24/10 (was Seen on site at survey #1 by Anh Sale, 23/10/2026)",
    ]);
  });

  it("adds the correction with its author and reason", () => {
    const meta = siteMeta({ enteredByUserId: B, enteredByName: "Binh Leader", correctionSaveId: "77", lastSource: "MEASURED" });
    expect(read({ state: "VALUE", source: "MEASURED" }, meta, VISIT, CORRECTIONS)).toEqual([
      "Measured at survey #1 by Anh Sale, 23/10/2026",
      "entered by Binh Leader 23/10 11:00",
      "Corrected by Binh Leader: Remeasured the room",
    ]);
  });

  it("names an unknown person as Unknown and gives no line for a unit never filled", () => {
    expect(read({ state: "VALUE", source: null }, siteMeta({ observedByName: null, enteredByName: null }), { ...VISIT, performedByName: null }, [])).toEqual([
      "Seen on site at survey #1 by Unknown, 23/10/2026",
      "entered by Unknown 23/10 11:00",
    ]);
    expect(provenanceLine({ state: "UNKNOWN", source: null }, null, VISIT, [])).toBeNull();
  });
});
