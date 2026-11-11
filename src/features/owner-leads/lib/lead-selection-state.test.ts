import { describe, expect, it } from "vitest";
import type { LeadSummary } from "@/features/lead-shared";

import {
  clear,
  heldByOthers,
  isSelected,
  type LeadSelection,
  NO_SELECTION,
  type OwnedSelection,
  pageCheck,
  selectable,
  selectionOf,
  surveyMoves,
  toggle,
  toggleAllOnPage,
} from "./lead-selection-state";

function lead(id: string, status: string, assignedUserId: string | null = null, version = 1): LeadSummary {
  return {
    id,
    requestCode: `SV-${id}`,
    status: status as LeadSummary["status"],
    version,
    assignedUserId,
    lastActivityAt: "2026-11-01T02:00:00Z",
  };
}

const ids = (selection: LeadSelection): string[] => selection.map((selected) => selected.id);

// One page of "All Leads": three open rows and one closed row, in the order of the answer.
const A = lead("A", "NEW");
const B = lead("B", "ASSIGNED", "u-sale", 4);
const C = lead("C", "REJECTED", "u-sale");
const D = lead("D", "SURVEY_SCHEDULED", "u-lan", 2);
const ROWS = [A, B, C, D] as const;

describe("selectable (acquisition-owner-lead-bulk-assign BR-2, D-8)", () => {
  it("keeps the id, code, version, holder and status of an open row", () => {
    expect(selectable(B)).toEqual({
      id: "B",
      requestCode: "SV-B",
      version: 4,
      assignedUserId: "u-sale",
      status: "ASSIGNED",
    });
    expect(selectable(A)).toEqual({ id: "A", requestCode: "SV-A", version: 1, assignedUserId: null, status: "NEW" });
    expect(selectable(lead("Z", "QUALIFIED", "u-x", 0))?.version).toBe(0);
  });

  it("accepts every open status and refuses the closed ones", () => {
    for (const status of ["NEW", "ASSIGNED", "CONTACTED", "ON_HOLD", "SURVEY_SCHEDULED", "QUALIFIED"]) {
      expect(selectable(lead("X", status))).not.toBeNull();
    }
    for (const status of ["DUPLICATE", "REJECTED", "WITHDRAWN"]) expect(selectable(lead("X", status))).toBeNull();
  });

  it("refuses a row without an id, without a version or with a status the workspace does not know", () => {
    expect(selectable({ ...A, id: undefined })).toBeNull();
    expect(selectable({ ...A, id: "" })).toBeNull();
    expect(selectable({ ...A, version: undefined })).toBeNull();
    expect(selectable({ ...A, status: undefined })).toBeNull();
    expect(selectable(lead("X", "VALIDATING"))).toBeNull();
  });

  it("gives an empty code to a row without one", () => {
    expect(selectable({ ...A, requestCode: undefined })?.requestCode).toBe("");
  });
});

describe("toggle", () => {
  it("adds and removes a row and keeps the order of the page whatever the click order", () => {
    let selection = toggle(NO_SELECTION, ROWS, "D");
    selection = toggle(selection, ROWS, "A");
    expect(ids(selection)).toEqual(["A", "D"]);
    expect(isSelected(selection, "D")).toBe(true);
    expect(isSelected(selection, "B")).toBe(false);

    selection = toggle(selection, ROWS, "B");
    expect(ids(selection)).toEqual(["A", "B", "D"]);

    selection = toggle(selection, ROWS, "A");
    expect(ids(selection)).toEqual(["B", "D"]);
  });

  it("ignores a closed row and an id that is not on the page", () => {
    expect(toggle(NO_SELECTION, ROWS, "C")).toEqual(NO_SELECTION);
    expect(toggle(NO_SELECTION, ROWS, "Q")).toEqual(NO_SELECTION);
  });
});

describe("toggleAllOnPage and pageCheck", () => {
  it("selects every selectable row of the page, then clears them", () => {
    expect(pageCheck(NO_SELECTION, ROWS)).toBe("unchecked");

    const some = toggle(NO_SELECTION, ROWS, "B");
    expect(pageCheck(some, ROWS)).toBe("mixed");

    const all = toggleAllOnPage(some, ROWS);
    expect(ids(all)).toEqual(["A", "B", "D"]);
    expect(pageCheck(all, ROWS)).toBe("checked");

    expect(toggleAllOnPage(all, ROWS)).toEqual(NO_SELECTION);
  });

  it("is unchecked on a page without a selectable row", () => {
    expect(pageCheck(NO_SELECTION, [C])).toBe("unchecked");
    expect(toggleAllOnPage(NO_SELECTION, [C])).toEqual(NO_SELECTION);
  });

  it("clear empties the selection", () => {
    expect(clear()).toEqual(NO_SELECTION);
    expect(clear()).toHaveLength(0);
  });
});

describe("heldByOthers (acquisition-owner-lead-bulk-assign BR-8)", () => {
  it("counts the leads held by someone other than the picked person; an unassigned lead holds nobody", () => {
    const selection = toggleAllOnPage(NO_SELECTION, ROWS);
    expect(heldByOthers(selection, "u-minh")).toBe(2);
    expect(heldByOthers(selection, "u-sale")).toBe(1);
    expect(heldByOthers(selection, "u-lan")).toBe(1);
    expect(heldByOthers(toggle(NO_SELECTION, ROWS, "A"), "u-minh")).toBe(0);
  });
});

describe("surveyMoves (acquisition-owner-lead-bulk-assign D-9)", () => {
  it("counts the Survey Scheduled leads of other holders", () => {
    const rows = [lead("S1", "SURVEY_SCHEDULED", "u-sale"), lead("S2", "SURVEY_SCHEDULED", "u-lan")];
    expect(surveyMoves(toggleAllOnPage(NO_SELECTION, rows), "u-minh")).toBe(2);
  });

  it("leaves out a Survey Scheduled lead the picked person already holds", () => {
    const rows = [lead("S1", "SURVEY_SCHEDULED", "u-minh")];
    expect(surveyMoves(toggleAllOnPage(NO_SELECTION, rows), "u-minh")).toBe(0);
  });

  it("leaves out the leads in every other open status", () => {
    const rows = [
      lead("N", "NEW"),
      lead("AS", "ASSIGNED", "u-sale"),
      lead("CO", "CONTACTED", "u-sale"),
      lead("OH", "ON_HOLD", "u-sale"),
      lead("QU", "QUALIFIED", "u-sale"),
    ];
    expect(surveyMoves(toggleAllOnPage(NO_SELECTION, rows), "u-minh")).toBe(0);
  });
});

describe("selectionOf (acquisition-owner-lead-bulk-assign 6.2, P-4)", () => {
  it("gives the selection only for the answer it was made on", () => {
    const answer = { items: ROWS };
    const owned: OwnedSelection = { of: answer, leads: toggle(NO_SELECTION, ROWS, "B") };

    expect(ids(selectionOf(owned, answer))).toEqual(["B"]);
    // A reload gives a new answer object, even with the same rows.
    expect(selectionOf(owned, { items: ROWS })).toEqual(NO_SELECTION);
    // Loading, another URL or a signed-out user: no answer on screen.
    expect(selectionOf(owned, null)).toEqual(NO_SELECTION);
    expect(selectionOf({ of: null, leads: owned.leads }, null)).toEqual(NO_SELECTION);
  });
});
