import { describe, expect, it } from "vitest";

import { createTabMemory } from "../drafts";

import { checklistDraftKey, CHECKLIST_DRAFT_GROUPS, dropChecklistDrafts, rebaseDraft, readChecklistDraft, writeChecklistDraft } from "./checklist-draft";
import { emptyContent, P1, P2, plain, siteMeta, sourced } from "./fixtures.test-support";
import { toGroupInput } from "./group-input";
import { unitKey } from "./units";

describe("writeChecklistDraft and readChecklistDraft (spec 6.2 Drafts)", () => {
  it("round-trips the edits with the version they were typed on", () => {
    const edits = { [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 30, "MEASURED") };
    const text = writeChecklistDraft(3, edits, []);
    expect(readChecklistDraft(text)).toEqual({ version: 3, edits, created: [] });
  });

  it("writes nothing for no edits and reads nothing from unreadable text", () => {
    expect(writeChecklistDraft(1, {}, [])).toBe("");
    expect(readChecklistDraft("")).toBeNull();
    expect(readChecklistDraft("{nope")).toBeNull();
    expect(readChecklistDraft(JSON.stringify({ version: "1", edits: {} }))).toBeNull();
  });
});

describe("rebaseDraft (spec 6.2: after a 409, a G1 removal or a scope switch)", () => {
  it("drops and lists the edits of a removed space, keeps the others", () => {
    const content = emptyContent("PARTS");
    const draft = {
      version: 1,
      created: [],
      edits: {
        [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 30, "MEASURED"),
        [unitKey.spaceField("dimensions", P2, "area")]: sourced("VALUE", 20, "MEASURED"),
      },
    };
    const rebased = rebaseDraft(draft, "dimensions", content.dimensions, { spaces: [P1], scope: "PARTS" });
    expect(rebased.edits).toEqual({ [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 30, "MEASURED") });
    expect(rebased.dropped).toEqual([unitKey.spaceField("dimensions", P2, "area")]);
  });

  it("drops the units the scope no longer allows", () => {
    const content = emptyContent("WHOLE");
    const draft = {
      version: 1,
      created: [],
      edits: {
        "condition/sharedKitchen": plain("VALUE", { result: "INSPECTED", noneObserved: true, note: null, notEnteredReason: null }),
        [unitKey.override(P1, "water")]: sourced("VALUE", { basis: "INCLUDED", amount: null, chargeUnit: null, note: null }, "OBSERVED_ON_SITE"),
      },
    };
    expect(rebaseDraft(draft, "condition", content.condition, { spaces: [P1], scope: "WHOLE" }).dropped).toEqual(["condition/sharedKitchen"]);
    expect(rebaseDraft(draft, "terms", content.terms, { spaces: [P1], scope: "WHOLE" }).dropped).toEqual([unitKey.override(P1, "water")]);
    const formRent = { [unitKey.spaceField("terms", P1, "monthlyRent")]: sourced("VALUE", { amount: 1, currency: "VND", unit: "MONTH" }, "OWNER_FORM") };
    expect(rebaseDraft({ version: 1, created: [], edits: formRent }, "terms", emptyContent().terms, { spaces: [P1, P2], scope: "PARTS" }).dropped).toEqual([
      unitKey.spaceField("terms", P1, "monthlyRent"),
    ]);
  });

  it("drops an edit of an entry someone else removed, keeps an entry the user created", () => {
    const content = emptyContent("PARTS");
    const draft = {
      version: 1,
      created: [unitKey.otherItem("NEW1")],
      edits: {
        [unitKey.otherItem("GONE")]: { itemId: "GONE", label: "Fan", spaceId: null, presence: "YES", source: "OBSERVED_ON_SITE", confirmedOn: null, receivedByUserId: null, relayBasis: null },
        [unitKey.otherItem("NEW1")]: { itemId: "NEW1", label: "Heater", spaceId: null, presence: "YES", source: "OBSERVED_ON_SITE", confirmedOn: null, receivedByUserId: null, relayBasis: null },
      },
    };
    const rebased = rebaseDraft(draft, "amenities", content.amenities, { spaces: [P1, P2], scope: "PARTS" });
    expect(Object.keys(rebased.edits)).toEqual([unitKey.otherItem("NEW1")]);
    expect(rebased.dropped).toEqual([unitKey.otherItem("GONE")]);
  });

  it("keeps the user's edits only: a body over the newer content carries what someone else saved meanwhile", () => {
    const older = emptyContent("PARTS");
    const newer = emptyContent("PARTS");
    newer.dimensions.spaces![1].area = { ...sourced("VALUE", 22, "MEASURED"), meta: siteMeta() } as never;
    const draft = { version: 1, created: [], edits: { [unitKey.spaceField("dimensions", P1, "area")]: sourced("VALUE", 30, "MEASURED") } };
    expect(older.dimensions.spaces![1].area).toEqual(sourced());
    const rebased = rebaseDraft(draft, "dimensions", newer.dimensions, { spaces: [P1, P2], scope: "PARTS" });
    const body = toGroupInput("dimensions", newer.dimensions, rebased.edits, { spaces: [P1, P2], scope: "PARTS" });
    expect(body.spaces[0].area).toEqual(sourced("VALUE", 30, "MEASURED"));
    expect(body.spaces[1].area).toEqual(sourced("VALUE", 22, "MEASURED"));
  });

  it("silently drops an edit the newer content already holds", () => {
    const newer = emptyContent("PARTS");
    newer.parts.accessRoute = { ...plain("VALUE", "Lane"), meta: siteMeta() } as never;
    const draft = { version: 1, created: [], edits: { "parts/accessRoute": plain("VALUE", "Lane") } };
    expect(rebaseDraft(draft, "parts", newer.parts, { spaces: [P1, P2], scope: "PARTS" })).toEqual({ edits: {}, dropped: [] });
  });
});

describe("checklist drafts in the tab memory", () => {
  it("keys them by user, lead, checklist and group in the shared store, and sign-out drops them", () => {
    const memory = createTabMemory();
    const key = checklistDraftKey({ userId: "u1", leadId: "L1", checklistId: "C1", group: "terms" });
    memory.guard.observe({ status: "signed-in", user: { userId: "u1" } });
    memory.drafts.set(key, "x");
    expect(memory.drafts.get(key)).toBe("x");
    memory.guard.observe({ status: "signed-out", user: null });
    expect(memory.drafts.get(key)).toBeUndefined();
  });

  it("drops every group draft of one checklist (404), and only those", () => {
    const memory = createTabMemory();
    const keys = CHECKLIST_DRAFT_GROUPS.map((group) => checklistDraftKey({ userId: "u1", leadId: "L1", checklistId: "C1", group }));
    const other = checklistDraftKey({ userId: "u1", leadId: "L1", checklistId: "C2", group: "terms" });
    for (const key of [...keys, other]) memory.drafts.set(key, "x");
    dropChecklistDrafts(memory.drafts, { userId: "u1", leadId: "L1", checklistId: "C1" });
    expect(keys.map((key) => memory.drafts.get(key))).toEqual(keys.map(() => undefined));
    expect(memory.drafts.get(other)).toBe("x");
  });
});
