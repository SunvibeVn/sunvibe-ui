import { describe, expect, it } from "vitest";

import type { IntakeBlock } from "../types";

import { availabilityBody, availabilityProblems, availabilityRows, type AvailabilityRow } from "./availability-form";

const TODAY = "2026-11-06";
const block: IntakeBlock = {
  version: 9,
  selection: { spaceIds: ["S1", "S2"] },
  availability: [{ spaceId: "S2", state: "OCCUPIED", contactedOn: "2026-11-05", note: "Tenant until March", expectedDate: "2027-03-01" }],
};
const good: AvailabilityRow = { spaceId: "S1", state: "VACANT", contactedOn: TODAY, note: "Owner said vacant", expectedDate: "" };

describe("availabilityRows", () => {
  it("gives one row per selected space, from what the block holds, and today for a new one", () => {
    expect(availabilityRows(block, TODAY)).toEqual([
      { spaceId: "S1", state: "", contactedOn: TODAY, note: "", expectedDate: "" },
      { spaceId: "S2", state: "OCCUPIED", contactedOn: "2026-11-05", note: "Tenant until March", expectedDate: "2027-03-01" },
    ]);
  });
});

describe("availabilityProblems", () => {
  it("is empty for good rows", () => {
    expect(availabilityProblems([good], TODAY)).toEqual({});
  });

  it("wants a state, a contact day and a note on each row: no contact means no completion (E-14)", () => {
    expect(availabilityProblems([{ ...good, state: "", contactedOn: "", note: " " }], TODAY)).toEqual({
      S1: { state: "required", contactedOn: "required", note: "required" },
    });
  });

  it("refuses a contact day after today in Vietnam", () => {
    expect(availabilityProblems([{ ...good, contactedOn: "2026-11-07" }], TODAY)).toEqual({ S1: { contactedOn: "tooLate" } });
  });

  it("keeps a note within 500 characters and free of a phone number", () => {
    expect(availabilityProblems([{ ...good, note: "a".repeat(501) }], TODAY)).toEqual({ S1: { note: "tooLong" } });
    expect(availabilityProblems([{ ...good, note: "Call 0901234567" }], TODAY)).toEqual({ S1: { note: "phone" } });
  });
});

describe("availabilityBody", () => {
  it("sends every row, the note clean, and an expected date only when given", () => {
    expect(
      availabilityBody([{ ...good, note: "  ok " }, { ...good, spaceId: "S2", state: "OCCUPIED", expectedDate: "2027-03-01" }], block),
    ).toEqual({
      expectedVersion: 9,
      items: [
        { spaceId: "S1", state: "VACANT", contactedOn: TODAY, note: "ok" },
        { spaceId: "S2", state: "OCCUPIED", contactedOn: TODAY, note: "Owner said vacant", expectedDate: "2027-03-01" },
      ],
    });
  });
});
