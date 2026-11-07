import { describe, expect, it } from "vitest";

import { earlierHazardRows, linkedEntry, newHazard, newOtherItem } from "./entries";
import { emptyContent, viewOf } from "./fixtures.test-support";
import { idle, panelEvent, saveFailureEvent, startSave } from "./panel-state";

const earlier = (hazardId: string, addressedBy: { kind: "RESOLVED" | "CARRIED"; checklistNo: number }[]) => ({
  checklistId: "C1",
  checklistNo: 1,
  hazard: { hazardId, description: `Risk ${hazardId}`, severity: "IMPORTANT" as const, status: "OPEN" as const },
  addressedBy: addressedBy.map((entry, index) => ({ checklistId: `C${entry.checklistNo}`, checklistNo: entry.checklistNo, hazardId: `L${index}`, kind: entry.kind })),
});

describe("earlierHazardRows (spec 6.2 G5, A-20, W16-30)", () => {
  it("shows open, seen resolved (any RESOLVED link wins) or carried", () => {
    const view = viewOf(emptyContent(), 1, {
      checklistNo: 3,
      earlierHazards: [
        earlier("H0", []),
        earlier("H1", [{ kind: "CARRIED", checklistNo: 2 }, { kind: "RESOLVED", checklistNo: 3 }]),
        earlier("H2", [{ kind: "CARRIED", checklistNo: 2 }]),
      ],
    });
    expect(earlierHazardRows(view).map((row) => [row.hazardId, row.state])).toEqual([
      ["H0", { kind: "open" }],
      ["H1", { kind: "resolved", checklistNo: 3 }],
      ["H2", { kind: "carried", checklistNo: 2 }],
    ]);
  });

  it("knows which earlier risks this checklist already links", () => {
    const linked = [{ hazardId: "N1", previous: { checklistId: "C1", hazardId: "H0" } }];
    const view = viewOf(emptyContent(), 1, { checklistNo: 2, earlierHazards: [earlier("H0", [])] });
    expect(earlierHazardRows(view, linked)[0].linkedHere).toBe(true);
    expect(earlierHazardRows(view, [])[0].linkedHere).toBe(false);
  });
});

describe("linkedEntry (A-22: the new entry starts with an empty description, nothing is copied)", () => {
  it("links the earlier hazard with a new client id and copies no description", () => {
    const entry = linkedEntry({ checklistId: "C1", hazardId: "H0" });
    expect(entry).toMatchObject({
      previous: { checklistId: "C1", hazardId: "H0" },
      description: "",
      status: "OPEN",
      statusNote: null,
      ownerReportedOn: null,
      receivedByUserId: null,
      relayBasis: null,
      spaceId: null,
    });
    expect(entry.hazardId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(entry.hazardId).not.toBe("H0");
  });
});

describe("new entries get new client ids (A-23, A-29)", () => {
  it("a new hazard and a new other item each get a fresh ULID, never a reused one", () => {
    const a = newHazard(null);
    const b = newHazard(null);
    expect(a.hazardId).not.toBe(b.hazardId);
    expect(a).toMatchObject({ previous: null, description: "", status: "OPEN" });
    const x = newOtherItem();
    const y = newOtherItem();
    expect(x.itemId).not.toBe(y.itemId);
    expect(x).toMatchObject({ label: "", presence: "YES", source: "OBSERVED_ON_SITE", spaceId: null });
  });
});

describe("an entry put back after its removal (W16-45, W16-46, W16-47)", () => {
  it("the server's 400 on correction opens the box and shows no saved status; the draft is not cleared", () => {
    const saving = startSave(idle()).state;
    const next = panelEvent(saving, saveFailureEvent({ kind: "correction-required", fieldErrors: { correction: "x" } }));
    expect(next.status).toBe("correction");
    expect(next.serverCorrection).toBe(true);
    expect(next.status).not.toBe("idle");
  });
});
