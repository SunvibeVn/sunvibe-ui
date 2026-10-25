import { describe, expect, it } from "vitest";

import { createTabMemory } from "../drafts";

import { applyAnswer } from "./answer-merge";
import { checklistDraftKey, rebaseAfterCascade, rebaseDraft, rebaseOtherDrafts, readChecklistDraft, writeChecklistDraft } from "./checklist-draft";
import { emptyContent, P1, P2, siteMeta, sourced, viewOf } from "./fixtures.test-support";
import { toGroupInput } from "./group-input";
import { readFailureEvent, viewEvent } from "./page-state";
import { unitKey } from "./units";

// Regression tests for the three fixes asked before gate 3 of PR #24, each as the sequence of steps that showed it.

const hazard = (hazardId: string, spaceId: string | null, description = "Loose railing") => ({
  hazardId,
  spaceId,
  previous: null,
  description,
  severity: "IMPORTANT" as const,
  status: "OPEN" as const,
  statusNote: null,
  ownerReportedOn: null,
  receivedByUserId: null,
  relayBasis: null,
});

describe("1. a G1 removal or scope switch keeps an unresolved conflict in the other groups", () => {
  const area = unitKey.spaceField("dimensions", P1, "area");

  it("keeps the version a conflicted draft was typed on, so its compare view stays until the user chooses", () => {
    // G3 draft typed on version 1; someone saved G3 (screen at version 2): conflict. Then the user's G1 save removes
    // P2 and the answer brings G3 at version 3.
    const draft = { version: 1, created: [], edits: { [area]: sourced("VALUE", 30, "MEASURED") } };
    const answerContent = emptyContent("PARTS").dimensions;
    const result = rebaseAfterCascade(draft, "dimensions", answerContent, { spaces: [P1], scope: "PARTS" }, 2, 3);
    expect(result.draft.version).toBe(1);
    expect(result.draft.version).not.toBe(3);
    expect(result.draft.edits).toEqual(draft.edits);
  });

  it("moves a draft without conflict onto the new version", () => {
    const draft = { version: 2, created: [], edits: { [area]: sourced("VALUE", 30, "MEASURED") } };
    const result = rebaseAfterCascade(draft, "dimensions", emptyContent("PARTS").dimensions, { spaces: [P1], scope: "PARTS" }, 2, 3);
    expect(result.draft.version).toBe(3);
  });

  it("rebaseOtherDrafts: after the G1 answer a conflicted G3 draft is still in conflict, a G8 draft without one moves on", () => {
    const memory = createTabMemory();
    const keyOf = (group: Parameters<typeof checklistDraftKey>[0]["group"]) =>
      checklistDraftKey({ userId: "u1", leadId: "L1", checklistId: "C1", group });
    const g3 = { [area]: sourced("VALUE", 30, "MEASURED") };
    const rent = unitKey.spaceField("terms", P1, "monthlyRent");
    const g8 = { [rent]: sourced("VALUE", { amount: 1, currency: "VND", unit: "MONTH" }, "OBSERVED_ON_SITE") };
    memory.drafts.set(keyOf("dimensions"), writeChecklistDraft(1, g3, []));
    memory.drafts.set(keyOf("terms"), writeChecklistDraft(2, g8, []));
    const screen = viewOf(emptyContent("PARTS"), 2);
    const answer = viewOf(emptyContent("WHOLE"), 3);
    const dropped = rebaseOtherDrafts(memory.drafts, keyOf, [screen], answer);
    expect(readChecklistDraft(memory.drafts.get(keyOf("dimensions")) ?? "")?.version).toBe(1);
    expect(readChecklistDraft(memory.drafts.get(keyOf("terms")) ?? "")?.version).toBe(3);
    expect(dropped).toEqual({});
  });

  it("rebaseOtherDrafts with no screen (route hidden mid-save) keeps every draft's version: it errs toward a conflict", () => {
    const memory = createTabMemory();
    const key = checklistDraftKey({ userId: "u1", leadId: "L1", checklistId: "C1", group: "dimensions" });
    memory.drafts.set(key, writeChecklistDraft(1, { [area]: sourced("VALUE", 30, "MEASURED") }, []));
    const keyOf = (group: Parameters<typeof checklistDraftKey>[0]["group"]) =>
      checklistDraftKey({ userId: "u1", leadId: "L1", checklistId: "C1", group });
    rebaseOtherDrafts(memory.drafts, keyOf, [null, null], viewOf(emptyContent("WHOLE"), 3));
    expect(readChecklistDraft(memory.drafts.get(key) ?? "")?.version).toBe(1);
  });

  it("a conflict that appeared on screen while the G1 save was in flight stays (sent at v2, screen now v3)", () => {
    const memory = createTabMemory();
    const keyOf = (group: Parameters<typeof checklistDraftKey>[0]["group"]) =>
      checklistDraftKey({ userId: "u1", leadId: "L1", checklistId: "C1", group });
    memory.drafts.set(keyOf("dimensions"), writeChecklistDraft(2, { [area]: sourced("VALUE", 30, "MEASURED") }, []));
    const sent = viewOf(emptyContent("PARTS"), 2);
    const now = viewOf(emptyContent("PARTS"), 3);
    rebaseOtherDrafts(memory.drafts, keyOf, [sent, now], viewOf(emptyContent("WHOLE"), 3));
    expect(readChecklistDraft(memory.drafts.get(keyOf("dimensions")) ?? "")?.version).toBe(2);
  });

  it("still drops and lists the edits of the removed space in a conflicted draft", () => {
    const p2 = unitKey.spaceField("dimensions", P2, "area");
    const draft = { version: 1, created: [], edits: { [area]: sourced("VALUE", 30, "MEASURED"), [p2]: sourced("VALUE", 9, "MEASURED") } };
    const result = rebaseAfterCascade(draft, "dimensions", emptyContent("PARTS").dimensions, { spaces: [P1], scope: "PARTS" }, 2, 3);
    expect(result.dropped).toEqual([p2]);
    expect(result.draft.version).toBe(1);
  });
});

describe("2. a saved hazard the server detached keeps its unsaved edits; a never-saved one does not follow", () => {
  it("keeps the edits of a saved hazard of a removed space at asset level, as the server detached it", () => {
    // Stored: H1 on P2. Draft: H1's description edited. G1 removes P2; the answer holds H1 with spaceId null.
    const after = emptyContent("PARTS");
    after.safety.hazards = { state: "VALUE", naReason: null, value: [{ ...hazard("H1", null), meta: siteMeta() }] } as never;
    const draft = { version: 1, created: [], edits: { [unitKey.hazard("H1")]: hazard("H1", P2, "Railing loose on the stairs") } };
    const rebased = rebaseDraft(draft, "safety", after.safety, { spaces: [P1], scope: "PARTS" });
    expect(rebased.dropped).toEqual([]);
    expect(rebased.edits[unitKey.hazard("H1")]).toEqual(hazard("H1", null, "Railing loose on the stairs"));
    const body = toGroupInput("safety", after.safety, rebased.edits, { spaces: [P1], scope: "PARTS" });
    expect(body.hazards.value).toEqual([hazard("H1", null, "Railing loose on the stairs")]);
  });

  it("gives no edit when the detached hazard had only its space changed", () => {
    const after = emptyContent("PARTS");
    after.safety.hazards = { state: "VALUE", naReason: null, value: [{ ...hazard("H1", null), meta: siteMeta() }] } as never;
    const draft = { version: 1, created: [], edits: { [unitKey.hazard("H1")]: hazard("H1", P2) } };
    expect(rebaseDraft(draft, "safety", after.safety, { spaces: [P1], scope: "PARTS" })).toEqual({ edits: {}, dropped: [] });
  });

  it("keeps the stored space of a saved hazard the draft moved to the removed space (the server did not detach it)", () => {
    // Stored: H1 on P1. Draft: H1 moved to P2 with a new description. G1 removes P2; H1 stays on P1 on the server.
    const after = emptyContent("PARTS");
    after.safety.hazards = { state: "VALUE", naReason: null, value: [{ ...hazard("H1", P1), meta: siteMeta() }] } as never;
    const draft = { version: 1, created: [], edits: { [unitKey.hazard("H1")]: hazard("H1", P2, "Railing loose on the stairs") } };
    const rebased = rebaseDraft(draft, "safety", after.safety, { spaces: [P1], scope: "PARTS" });
    expect(rebased.edits[unitKey.hazard("H1")]).toEqual(hazard("H1", P1, "Railing loose on the stairs"));
    const onlyMoved = { version: 1, created: [], edits: { [unitKey.hazard("H1")]: hazard("H1", P2) } };
    expect(rebaseDraft(onlyMoved, "safety", after.safety, { spaces: [P1], scope: "PARTS" }).edits).toEqual({});
  });

  it("drops and lists a never-saved hazard typed for the removed space (the server never saw it)", () => {
    const draft = { version: 1, created: [unitKey.hazard("N1")], edits: { [unitKey.hazard("N1")]: hazard("N1", P2, "New crack") } };
    const rebased = rebaseDraft(draft, "safety", emptyContent("PARTS").safety, { spaces: [P1], scope: "PARTS" });
    expect(rebased.edits).toEqual({});
    expect(rebased.dropped).toEqual([unitKey.hazard("N1")]);
  });
});

describe("3. a 403 locks editing at once; only a successful read that says editable unlocks it", () => {
  const editable = viewOf(emptyContent(), 1, { editable: true, readOnlyReason: null });
  const shown = { view: editable, locked: false };

  it("locks on the 403, reads again, and keeps a late save answer read-only", () => {
    const afterForbidden = viewEvent(shown, { type: "forbidden" });
    expect(afterForbidden.state.view).toMatchObject({ editable: false, readOnlyReason: "NOT_ASSIGNEE" });
    expect(afterForbidden.reload).toBe(true);
    // A PUT that was on its way answers 200 with editable: true and a newer group after the 403.
    const late = viewOf(emptyContent(), 2, { editable: true });
    const afterAnswer = viewEvent(afterForbidden.state, { type: "answer", view: late });
    expect(afterAnswer.state.view?.editable).toBe(false);
    expect(afterAnswer.reload).toBe(true);
  });

  it("stays read-only when the reload fails, and unlocks after a successful read that says editable", () => {
    const locked = viewEvent(shown, { type: "forbidden" }).state;
    const failed = viewEvent(locked, { type: "readFailed" });
    expect(failed.state.view?.editable).toBe(false);
    expect(failed.state.locked).toBe(true);
    const read = viewEvent(failed.state, { type: "read", view: editable });
    expect(read.state).toEqual({ view: editable, locked: false });
  });

  it("keeps the server's own reason when the successful read says read-only", () => {
    const locked = viewEvent(shown, { type: "forbidden" }).state;
    const readOnly = viewOf(emptyContent(), 1, { editable: false, readOnlyReason: "LEAD_STATUS" });
    expect(viewEvent(locked, { type: "read", view: readOnly }).state.view).toMatchObject({ editable: false, readOnlyReason: "LEAD_STATUS" });
  });

  it("a takeover answered while locked stays read-only and asks for a read, which then restores editing", () => {
    const locked = viewEvent(shown, { type: "forbidden" }).state;
    const takenOver = viewOf(emptyContent(), 1, { editable: true, version: 2, holderUserId: "u1" });
    const afterTakeover = viewEvent(locked, { type: "answer", view: takenOver });
    expect(afterTakeover.state.view?.editable).toBe(false);
    expect(afterTakeover.reload).toBe(true);
    expect(viewEvent(afterTakeover.state, { type: "read", view: takenOver }).state.view?.editable).toBe(true);
  });

  it("a late 200 that is not newer than the read cannot make the page editable again", () => {
    const readOnly = viewOf(emptyContent(), 2, { editable: false, readOnlyReason: "NOT_ASSIGNEE" });
    const afterRead = viewEvent({ view: editable, locked: true }, { type: "read", view: readOnly }).state;
    const lateSameVersions = viewOf(emptyContent(), 2, { editable: true, readOnlyReason: null });
    expect(viewEvent(afterRead, { type: "answer", view: lateSameVersions }).state.view?.editable).toBe(false);
    expect(applyAnswer(readOnly, lateSameVersions)).toEqual({ view: readOnly, applied: [], needsReload: false });
  });

  it("a 403 on the reload itself locks editing too (spec 6.3: any 403)", () => {
    const event = readFailureEvent({ kind: "forbidden" });
    expect(event).toEqual({ type: "forbidden" });
    expect(viewEvent({ view: editable, locked: false }, event).state.view?.editable).toBe(false);
    expect(readFailureEvent({ kind: "retry" })).toEqual({ type: "readFailed" });
    expect(readFailureEvent({ kind: "not-found" })).toEqual({ type: "readFailed" });
  });

  it("an answer with no view on screen (sent before the route was hidden) is not shown: the page reads instead", () => {
    // PUT B answered 403 while hidden (the lock is still recorded); on return PUT A answers 200 editable before the read.
    const hiddenForbidden = viewEvent({ view: null, locked: false }, { type: "forbidden" });
    expect(hiddenForbidden.state).toEqual({ view: null, locked: true });
    const lateAnswer = viewEvent(hiddenForbidden.state, { type: "answer", view: editable });
    expect(lateAnswer.state.view).toBeNull();
    expect(lateAnswer.reload).toBe(true);
    // Even without a 403, an answer never shows a checklist before the read that follows a re-show (W16-32).
    expect(viewEvent({ view: null, locked: false }, { type: "answer", view: editable })).toEqual({
      state: { view: null, locked: false },
      reload: true,
    });
  });
});
