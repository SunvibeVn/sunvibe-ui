import { describe, expect, it } from "vitest";

import { createTabMemory } from "../drafts";

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
  unlockAll,
  unlockGroup,
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
