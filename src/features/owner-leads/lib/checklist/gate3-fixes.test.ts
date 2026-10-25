import { describe, expect, it } from "vitest";

import { rebaseAfterCascade, rebaseDraft } from "./checklist-draft";
import { emptyContent, P1, P2, siteMeta, sourced, viewOf } from "./fixtures.test-support";
import { toGroupInput } from "./group-input";
import { createEditLock } from "./page-state";
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

  it("drops and lists a never-saved hazard typed for the removed space (the server never saw it)", () => {
    const draft = { version: 1, created: [unitKey.hazard("N1")], edits: { [unitKey.hazard("N1")]: hazard("N1", P2, "New crack") } };
    const rebased = rebaseDraft(draft, "safety", emptyContent("PARTS").safety, { spaces: [P1], scope: "PARTS" });
    expect(rebased.edits).toEqual({});
    expect(rebased.dropped).toEqual([unitKey.hazard("N1")]);
  });
});

describe("3. a 403 locks editing at once; only a successful read that says editable unlocks it", () => {
  const editable = viewOf(emptyContent(), 1, { editable: true, readOnlyReason: null });

  it("locks on the 403 and keeps a late save answer read-only", () => {
    const lock = createEditLock();
    expect(lock.apply(editable).editable).toBe(true);
    lock.forbidden();
    expect(lock.apply(editable)).toMatchObject({ editable: false, readOnlyReason: "NOT_ASSIGNEE" });
    // A PUT that was on its way answers 200 with editable: true after the 403.
    expect(lock.apply({ ...editable, version: 2 }).editable).toBe(false);
  });

  it("stays read-only when the reload fails, and unlocks after a successful read that says editable", () => {
    const lock = createEditLock();
    lock.forbidden();
    lock.readFailed();
    expect(lock.apply(editable).editable).toBe(false);
    lock.readSucceeded();
    expect(lock.apply(editable).editable).toBe(true);
  });

  it("keeps the server's own reason when the successful read says read-only", () => {
    const lock = createEditLock();
    lock.forbidden();
    lock.readSucceeded();
    const readOnly = viewOf(emptyContent(), 1, { editable: false, readOnlyReason: "LEAD_STATUS" });
    expect(lock.apply(readOnly)).toMatchObject({ editable: false, readOnlyReason: "LEAD_STATUS" });
  });
});
