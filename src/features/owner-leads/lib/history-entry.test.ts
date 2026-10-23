import { describe, expect, it } from "vitest";

import {
  entryDraftOpen,
  entryMax,
  entryStatusDraft,
  entryStatusForm,
  entryTargets,
  KEEP_STATUS,
  noteMessage,
} from "./history-entry";
import { NOTE_MAX } from "./note-length";
import { REASON_MAX } from "./status-flow";

const NO_ORIGINAL = { kind: "none" } as const;

describe("entryTargets", () => {
  it("offers keeping the status first, then the allowed targets", () => {
    expect(entryTargets("ASSIGNED")).toEqual([KEEP_STATUS, "CONTACTED", "ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
    expect(entryTargets("NEW")).toEqual([KEEP_STATUS, "DUPLICATE", "REJECTED", "WITHDRAWN"]);
  });

  it("offers nothing on a closed lead or an unknown status", () => {
    expect(entryTargets("REJECTED")).toEqual([]);
    expect(entryTargets(undefined)).toEqual([]);
  });
});

describe("entryMax", () => {
  it("is the note limit when the status stays or moves to an open status", () => {
    expect(entryMax(KEEP_STATUS)).toBe(NOTE_MAX);
    expect(entryMax("CONTACTED")).toBe(NOTE_MAX);
    expect(entryMax("ON_HOLD")).toBe(NOTE_MAX);
  });

  it("is the reason limit when the entry closes the lead", () => {
    expect(entryMax("DUPLICATE")).toBe(REASON_MAX);
    expect(entryMax("REJECTED")).toBe(REASON_MAX);
    expect(entryMax("WITHDRAWN")).toBe(REASON_MAX);
  });
});

describe("entryStatusForm", () => {
  it("sends the activity as the optional note of an open target, never a next action", () => {
    expect(entryStatusForm("CONTACTED", "Called the owner", NO_ORIGINAL)).toEqual({
      target: "CONTACTED",
      reason: "",
      note: "Called the owner",
      nextAction: "",
      original: NO_ORIGINAL,
    });
  });

  it("sends the activity as the close reason of a closing target, with the original of a duplicate", () => {
    const original = { kind: "text", text: "SV-E2EA-AA2G" } as const;
    expect(entryStatusForm("DUPLICATE", "Same house as AA2G", original)).toEqual({
      target: "DUPLICATE",
      reason: "Same house as AA2G",
      note: "",
      nextAction: "",
      original,
    });
    expect(entryStatusForm("REJECTED", "Not a rental", NO_ORIGINAL).reason).toBe("Not a rental");
  });
});

describe("noteMessage", () => {
  it("maps the failures shown under the entry to command messages, with the support code", () => {
    expect(noteMessage({ kind: "stale", correlationId: "c-1" })).toEqual({ kind: "stale", correlationId: "c-1" });
    expect(noteMessage({ kind: "forbidden" })).toEqual({ kind: "forbidden" });
    expect(noteMessage({ kind: "failed", correlationId: "c-2" })).toEqual({ kind: "failed", correlationId: "c-2" });
    expect(noteMessage({ kind: "rejected", correlationId: "c-3" })).toEqual({ kind: "bad-request", correlationId: "c-3" });
  });

  it("has no message where the entry shows the problem itself or the page moves on", () => {
    expect(noteMessage({ kind: "rejected", note: true })).toBeNull();
    expect(noteMessage({ kind: "invalid", note: "required" })).toBeNull();
    expect(noteMessage({ kind: "closed" })).toBeNull();
    expect(noteMessage({ kind: "gone" })).toBeNull();
    expect(noteMessage({ kind: "saved", result: {} })).toBeNull();
  });
});

describe("entryStatusDraft", () => {
  it("keeps no draft for keeping the status, the target otherwise", () => {
    expect(entryStatusDraft(KEEP_STATUS)).toBe("");
    expect(entryStatusDraft("DUPLICATE")).toBe("DUPLICATE");
  });
});

describe("entryDraftOpen", () => {
  it("opens the row for a typed activity or a chosen status", () => {
    expect(entryDraftOpen({ activity: "Called", status: "" })).toBe(true);
    expect(entryDraftOpen({ activity: "", status: "CONTACTED" })).toBe(true);
    expect(entryDraftOpen({ activity: "", status: "DUPLICATE" })).toBe(true);
  });

  it("stays closed without a typed activity or a chosen status (keeping the status keeps no draft)", () => {
    expect(entryDraftOpen({ activity: "", status: entryStatusDraft(KEEP_STATUS) })).toBe(false);
  });
});
