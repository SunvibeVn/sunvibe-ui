import { describe, expect, it } from "vitest";

import type { LeadActivity } from "../types";

import { historyActor } from "./history-actor";

const activity = (overrides: Partial<LeadActivity>): LeadActivity => ({ type: "NOTE_ADDED", ...overrides });

describe("historyActor (W11-39)", () => {
  it("shows the staff name when the API sent one", () => {
    expect(historyActor(activity({ actorUserId: "U1", actorName: "Nguyễn An" }))).toEqual({
      kind: "name",
      name: "Nguyễn An",
    });
  });

  it("a SUBMITTED entry without an actor is the owner", () => {
    expect(historyActor(activity({ type: "SUBMITTED" }))).toEqual({ kind: "owner" });
    expect(historyActor(activity({ type: "SUBMITTED", actorUserId: undefined, actorName: null }))).toEqual({
      kind: "owner",
    });
  });

  it("an AUTO_ASSIGNED entry without an actor is the system", () => {
    expect(historyActor(activity({ type: "AUTO_ASSIGNED", actorName: null }))).toEqual({ kind: "system" });
  });

  it("an actor id without a name is unknown, never the owner or the system", () => {
    expect(historyActor(activity({ type: "SUBMITTED", actorUserId: "U9", actorName: null }))).toEqual({
      kind: "unknown",
    });
    expect(historyActor(activity({ type: "AUTO_ASSIGNED", actorUserId: "U9" }))).toEqual({ kind: "unknown" });
  });

  it("a blank name counts as no name", () => {
    expect(historyActor(activity({ actorUserId: "U1", actorName: "   " }))).toEqual({ kind: "unknown" });
  });

  it("a staff entry without actor id and name is unknown", () => {
    expect(historyActor(activity({ type: "STATUS_CHANGED" }))).toEqual({ kind: "unknown" });
    expect(historyActor(activity({}))).toEqual({ kind: "unknown" });
  });
});
