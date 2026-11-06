import { describe, expect, it } from "vitest";
import { createTabMemory } from "@/features/lead-shared/client";

import { checklistDraftKey } from "./checklist-draft";
import { emptyContent, viewOf } from "./fixtures.test-support";
import {
  checkpointFailure,
  createAnswerGate,
  forgetChecklist,
  forgetLeadChecklists,
  isPanelLocked,
  lockAll,
  lockGroup,
  NO_LOCKS,
  pageFailureStep,
  readOnlyNotice,
  readOrder,
  unlockAll,
  unlockGroup,
  viewEvent,
} from "./page-state";

describe("readOnlyNotice (spec 6.2, 6.4, W16-32)", () => {
  it("is null for an editor", () => {
    expect(readOnlyNotice(viewOf(emptyContent()))).toBeNull();
  });

  it("names each read-only reason of 6.4 by readOnlyReason, the takeover prompt for TAKEOVER_REQUIRED", () => {
    for (const reason of ["INTENT_CHANGED", "NEWER_VISIT", "LEAD_STATUS", "NOT_ASSIGNEE", "ASSIGNEE_INELIGIBLE"] as const) {
      expect(readOnlyNotice(viewOf(emptyContent(), 1, { editable: false, readOnlyReason: reason }))).toEqual({
        kind: "reason",
        key: `checklist.readOnly.${reason}`,
      });
    }
    expect(readOnlyNotice(viewOf(emptyContent(), 1, { editable: false, readOnlyReason: "TAKEOVER_REQUIRED" }))).toEqual({
      kind: "takeover",
    });
    expect(readOnlyNotice(viewOf(emptyContent(), 1, { editable: false, readOnlyReason: null }))).toEqual({
      kind: "reason",
      key: "checklist.readOnly.NOT_ASSIGNEE",
    });
  });
});

describe("panel locks (spec 6.2: each save locks its panel, a takeover or a G1 cascade all)", () => {
  it("a takeover locks every panel", () => {
    const locks = lockAll(NO_LOCKS);
    for (const group of ["identification", "parts", "dimensions", "condition", "safety", "amenities", "terms"] as const) {
      expect(isPanelLocked(locks, group)).toBe(true);
    }
    expect(isPanelLocked(unlockAll(locks), "terms")).toBe(false);
  });

  it("a group save locks only its panel", () => {
    const locks = lockGroup(NO_LOCKS, "dimensions");
    expect(isPanelLocked(locks, "dimensions")).toBe(true);
    expect(isPanelLocked(locks, "terms")).toBe(false);
    expect(isPanelLocked(unlockGroup(locks, "dimensions"), "dimensions")).toBe(false);
  });
});

describe("forgetChecklist (W16-32: a 404 drops the checklist's drafts)", () => {
  it("drops every group draft of the checklist", () => {
    const memory = createTabMemory();
    const key = checklistDraftKey({ userId: "u1", leadId: "L1", checklistId: "C1", group: "dimensions" });
    memory.drafts.set(key, "x");
    forgetChecklist(memory.drafts, { userId: "u1", leadId: "L1", checklistId: "C1" });
    expect(memory.drafts.get(key)).toBeUndefined();
  });
});

describe("pageFailureStep (spec 6.3)", () => {
  it("maps the page-level outcomes by kind", () => {
    expect(pageFailureStep({ kind: "not-found" })).toEqual({ kind: "leave" });
    expect(pageFailureStep({ kind: "signed-out" })).toEqual({ kind: "session" });
    expect(pageFailureStep({ kind: "forbidden" })).toEqual({ kind: "reload", message: "forbidden" });
    expect(pageFailureStep({ kind: "read-only" })).toEqual({ kind: "reload", message: "readOnlyNow" });
    expect(pageFailureStep({ kind: "takeover-required" })).toEqual({ kind: "reload", message: "takeoverRequired" });
    expect(pageFailureStep({ kind: "stale", staleGroup: null })).toEqual({ kind: "panel" });
    expect(pageFailureStep({ kind: "validation", fieldErrors: {} })).toEqual({ kind: "panel" });
    expect(pageFailureStep({ kind: "retry" })).toEqual({ kind: "panel" });
  });
});

describe("createAnswerGate (security M1: an answer after the route is hidden shows nothing)", () => {
  it("lets answers through while shown and drops them while hidden", () => {
    const gate = createAnswerGate();
    expect(gate.open()).toBe(true);
    gate.hide();
    expect(gate.open()).toBe(false);
    gate.show();
    expect(gate.open()).toBe(true);
  });
});

describe("checkpointFailure (security M2: a 404 on a snapshot leaves like any 404)", () => {
  it("leaves on a 404, answers the session itself, else shows the inline error", () => {
    expect(checkpointFailure({ kind: "not-found" })).toBe("leave");
    expect(checkpointFailure({ kind: "signed-out" })).toBe("session");
    expect(checkpointFailure({ kind: "retry" })).toBe("inline");
    expect(checkpointFailure({ kind: "forbidden" })).toBe("inline");
  });
});

describe("forgetLeadChecklists (security M3: a 404 on a start drops the intake and checklist drafts of the lead)", () => {
  it("drops the intake draft and every checklist draft of the lead, nothing else", () => {
    const memory = createTabMemory();
    const intake = { userId: "u1", leadId: "L1", form: "checklistIntake" as const };
    const group = checklistDraftKey({ userId: "u1", leadId: "L1", checklistId: "C9", group: "terms" });
    const note = { userId: "u1", leadId: "L1", form: "activity" as const };
    const otherLead = checklistDraftKey({ userId: "u1", leadId: "L2", checklistId: "C2", group: "terms" });
    for (const key of [intake, group, note, otherLead]) memory.drafts.set(key, "x");
    forgetLeadChecklists(memory.drafts, { userId: "u1", leadId: "L1" });
    expect([intake, group, note, otherLead].map((key) => memory.drafts.get(key))).toEqual([undefined, undefined, "x", "x"]);
  });
});

describe("a 403 ends a review (survey-checklist submission 6.3, 4.2)", () => {
  it("clears the hint of a read-only revision, so no form stays live on it", () => {
    const view = viewOf(emptyContent(), 1, {
      status: "SUBMITTED",
      editable: false,
      readOnlyReason: "SUBMITTED",
      review: { canReview: true, reason: null, decisionBlockedBy: [] },
    });
    const { state, reload } = viewEvent({ view, locked: false }, { type: "forbidden" });
    expect(state.view?.review?.canReview).toBe(false);
    expect(state.view?.readOnlyReason).toBe("SUBMITTED");
    expect(state.locked).toBe(true);
    expect(reload).toBe(true);
  });

  it("leaves a read-only view without the hint as it is", () => {
    const view = viewOf(emptyContent(), 1, { editable: false, readOnlyReason: "NOT_ASSIGNEE" });
    expect(viewEvent({ view, locked: false }, { type: "forbidden" }).state.view).toBe(view);
  });
});

describe("readOrder by status (survey-checklist submission 4.1: nothing returns to DRAFT)", () => {
  const content = emptyContent();
  const at = (status: "DRAFT" | "SUBMITTED" | "PASSED" | "NEEDS_CHANGES" | "FAILED", version: number, set = 0) =>
    viewOf(content, 1, { status, version, media: { available: true, uploadEnabled: true, setVersion: set } });

  it("pageState_olderReadAfterSubmit_ignored: a read sent before the submit answers after it", () => {
    const screen = { view: at("SUBMITTED", 5), locked: false };
    const result = viewEvent(screen, { type: "read", view: at("DRAFT", 4) });
    expect(result).toEqual({ state: screen, reload: false });
  });

  it("ignores a read of an earlier status even when another version of it is higher", () => {
    expect(readOrder(at("SUBMITTED", 5, 2), at("DRAFT", 4, 3))).toBe("older");
    expect(readOrder(at("PASSED", 6, 2), at("SUBMITTED", 5, 3))).toBe("older");
  });

  it("a newer status wins over any lower version: the page never waits on a stale photo version", () => {
    expect(readOrder(at("DRAFT", 4, 3), at("SUBMITTED", 5, 2))).toBe("current");
    expect(readOrder(at("SUBMITTED", 5, 3), at("NEEDS_CHANGES", 6, 2))).toBe("current");
    const shown = viewEvent({ view: at("SUBMITTED", 5, 3), locked: false }, { type: "read", view: at("FAILED", 6, 2) });
    expect(shown.state.view?.status).toBe("FAILED");
    expect(shown.reload).toBe(false);
  });

  it("treats the three decided statuses alike and compares their versions as before", () => {
    expect(readOrder(at("PASSED", 6), at("FAILED", 7))).toBe("current");
    expect(readOrder(at("PASSED", 6), at("PASSED", 5))).toBe("older");
  });

  it("orders a read without a status as a draft", () => {
    expect(readOrder(at("SUBMITTED", 5), viewOf(content, 1, { status: undefined, version: 9 }))).toBe("older");
  });
});

describe("viewEvent read ordering (SV-004, survey-media spec 6.1: a read older than the screen is ignored)", () => {
  const content = emptyContent();
  /** A read at checklist version `version`, every group at `groups` except the overrides, media set version `set`. */
  const read = (
    version: number,
    groups: number,
    set: number,
    overrides: Partial<Record<"dimensions" | "terms", number>> = {},
    extra: Parameters<typeof viewOf>[2] = {},
  ) => {
    const view = viewOf(content, groups, { version, media: { available: true, uploadEnabled: true, setVersion: set }, ...extra });
    const groupsOf = { ...view.groups };
    for (const [group, value] of Object.entries(overrides) as Array<["dimensions" | "terms", number]>) {
      groupsOf[group] = { ...groupsOf[group], version: value };
    }
    return { ...view, groups: groupsOf };
  };

  it("olderReadAfterNewerGroupSave_isIgnored: the save answer raises only its group's version", () => {
    const screen = read(1, 1, 3);
    // A group save never touches the checklist row: version stays 1, only G3 moves to 2.
    const answer = read(1, 1, 3, { dimensions: 2 });
    const afterSave = viewEvent({ view: screen, locked: false }, { type: "answer", view: answer }).state;
    expect(afterSave.view?.groups?.dimensions?.version).toBe(2);
    const late = viewEvent(afterSave, { type: "read", view: read(1, 1, 3) });
    expect(late.state.view).toBe(afterSave.view);
    expect(late.reload).toBe(false);
  });

  it("readWithLowerSetVersion_isIgnored", () => {
    const shown = read(1, 1, 5);
    const late = viewEvent({ view: shown, locked: false }, { type: "read", view: read(1, 1, 4) });
    expect(late.state.view).toBe(shown);
    expect(late.reload).toBe(false);
  });

  it("mixedVersions_triggerReread: higher in one version and lower in another keeps the screen and reads again", () => {
    const shown = read(1, 1, 3, { dimensions: 2 });
    const mixed = viewEvent({ view: shown, locked: false }, { type: "read", view: read(1, 1, 3, { terms: 2 }) });
    expect(mixed.state.view).toBe(shown);
    expect(mixed.reload).toBe(true);
    const mixedSet = viewEvent({ view: shown, locked: false }, { type: "read", view: read(2, 1, 2, { dimensions: 2 }) });
    expect(mixedSet.state.view).toBe(shown);
    expect(mixedSet.reload).toBe(true);
  });

  it("olderReadAfterTakeoverAnswer_isIgnored: a takeover raises the checklist version", () => {
    const before = read(1, 1, 3);
    const takenOver = read(2, 1, 3, {}, { holderUserId: "B", holderName: "Binh Leader" });
    const afterTakeover = viewEvent({ view: before, locked: false }, { type: "answer", view: takenOver }).state;
    expect(afterTakeover.view?.holderUserId).toBe("B");
    const late = viewEvent(afterTakeover, { type: "read", view: before });
    expect(late.state.view?.holderUserId).toBe("B");
    expect(late.reload).toBe(false);
  });

  it("a read of the same versions applies (editability may change without a version, W16)", () => {
    const shown = read(1, 1, 3);
    const readOnly = read(1, 1, 3, {}, { editable: false, readOnlyReason: "NOT_ASSIGNEE" });
    expect(viewEvent({ view: shown, locked: false }, { type: "read", view: readOnly }).state.view).toBe(readOnly);
  });

  it("a newer read applies; an ignored read while a 403 lock holds asks for a read again", () => {
    const shown = read(1, 1, 3);
    const newer = read(2, 2, 4);
    expect(viewEvent({ view: shown, locked: false }, { type: "read", view: newer }).state).toEqual({ view: newer, locked: false });
    const lockedLate = viewEvent({ view: read(1, 1, 5), locked: true }, { type: "read", view: read(1, 1, 4) });
    expect(lockedLate.state.locked).toBe(true);
    expect(lockedLate.reload).toBe(true);
  });

  it("a read without media (photos not available) compares the other versions only", () => {
    const shown = viewOf(content, 1);
    const same = viewOf(content, 1, { editable: false, readOnlyReason: "LEAD_STATUS" });
    expect(viewEvent({ view: shown, locked: false }, { type: "read", view: same }).state.view).toBe(same);
  });
});
