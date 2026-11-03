import { describe, expect, it } from "vitest";

import type { ChecklistView, MediaList } from "@/features/surveys";

import { emptyContent, viewOf } from "./fixtures.test-support";
import { listDecision } from "./media-ordering";

/** A checklist read at checklist version 3, G1 version 2, G4 version 1, media set version 5. */
function screenView(): ChecklistView {
  const view = viewOf(emptyContent(), 1, { version: 3, media: { available: true, uploadEnabled: true, setVersion: 5 } });
  return {
    ...view,
    groups: {
      ...view.groups,
      identification: { ...view.groups?.identification, version: 2 },
      condition: { ...view.groups?.condition, version: 1 },
    },
  };
}

function list(setVersion: number, basis: Partial<{ g1: number; g4: number; checklist: number }> = {}): MediaList {
  return {
    checklistId: "C1",
    setVersion,
    basis: {
      identificationVersion: basis.g1 ?? 2,
      conditionVersion: basis.g4 ?? 1,
      checklistVersion: basis.checklist ?? 3,
      stateEpoch: 1,
      viewDigest: "d",
    },
    items: [],
  };
}

describe("listDecision (survey-media spec 6.2: a list applies only when no version is lower than shown)", () => {
  it("applies a list of the screen's versions without a checklist read", () => {
    expect(listDecision({ view: screenView(), list: null }, list(5))).toEqual({ apply: true, rereadChecklist: false });
  });

  it("olderListAfterNewer_isIgnored: a lower setVersion than the list shown", () => {
    const shown = list(7);
    expect(listDecision({ view: screenView(), list: shown }, list(6))).toMatchObject({ apply: false });
  });

  it("olderListAfterNewer_isIgnored: lower than the checklist on screen in setVersion, G1, G4 or the checklist", () => {
    const view = screenView();
    expect(listDecision({ view, list: null }, list(4))).toMatchObject({ apply: false });
    expect(listDecision({ view, list: null }, list(5, { g1: 1 }))).toMatchObject({ apply: false });
    expect(listDecision({ view, list: null }, list(5, { g4: 0 }))).toMatchObject({ apply: false });
    expect(listDecision({ view, list: null }, list(5, { checklist: 2 }))).toMatchObject({ apply: false });
  });

  it("olderListAfterNewer_isIgnored: lower G1 than the list shown, even when the checklist read is older", () => {
    expect(listDecision({ view: screenView(), list: list(5, { g1: 3 }) }, list(5, { g1: 2 }))).toMatchObject({
      apply: false,
    });
  });

  it("higherChecklistVersion_asksChecklistReread: a higher checklist version or setVersion than the checklist read", () => {
    expect(listDecision({ view: screenView(), list: null }, list(5, { checklist: 4 }))).toEqual({
      apply: true,
      rereadChecklist: true,
    });
    expect(listDecision({ view: screenView(), list: null }, list(6))).toEqual({ apply: true, rereadChecklist: true });
  });

  it("a higher G1 or G4 alone applies without a checklist read", () => {
    expect(listDecision({ view: screenView(), list: null }, list(5, { g1: 3, g4: 2 }))).toEqual({
      apply: true,
      rereadChecklist: false,
    });
  });

  it("with no checklist on screen applies by the list alone", () => {
    expect(listDecision({ view: null, list: list(5) }, list(5))).toEqual({ apply: true, rereadChecklist: false });
    expect(listDecision({ view: null, list: list(5) }, list(4))).toMatchObject({ apply: false });
  });
});
