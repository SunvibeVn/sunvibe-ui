import { describe, expect, it } from "vitest";

import type { LeadActivity } from "../types";

import { historyStatus } from "./history-status";

/** An entry as the API sends it: every empty field is written as null, not left out. */
const wire = (json: string): LeadActivity => JSON.parse(json) as LeadActivity;

describe("historyStatus (D-4: STATUS of an earlier entry)", () => {
  it("is the status a status change moved the lead to", () => {
    expect(historyStatus(wire('{"type":"STATUS_CHANGED","fromStatus":"ASSIGNED","toStatus":"CONTACTED"}'))).toBe(
      "CONTACTED",
    );
  });

  it("is undefined for a note or an assignment, whose toStatus the API sends as null", () => {
    expect(historyStatus(wire('{"type":"NOTE_ADDED","fromStatus":null,"toStatus":null,"note":"Gọi lại"}'))).toBeUndefined();
    expect(historyStatus(wire('{"type":"ASSIGNED","fromStatus":null,"toStatus":null}'))).toBeUndefined();
  });

  it("is undefined when the field is left out", () => {
    expect(historyStatus({ type: "NOTE_ADDED" })).toBeUndefined();
  });
});
