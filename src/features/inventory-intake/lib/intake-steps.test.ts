import { describe, expect, it } from "vitest";

import type { IntakeBlock } from "../types";

import { intakeSteps, restorationView, targetModes } from "./intake-steps";

const open: IntakeBlock["gate"] = { ready: true, reasons: [] };
const closed: IntakeBlock["gate"] = { ready: false, reasons: ["NOT_QUALIFIED"] };
const ASSIGNEE = { assignee: true };
const OTHER = { assignee: false };

const names = (block: IntakeBlock, viewer = ASSIGNEE) => intakeSteps(block, viewer).map((step) => step.name);
const acting = (block: IntakeBlock, viewer = ASSIGNEE) =>
  intakeSteps(block, viewer)
    .filter((step) => step.mode === "act")
    .map((step) => step.name);

describe("intakeSteps", () => {
  it("steps_gateClosed_noWayPast: a closed gate offers no step at all, whatever the row holds", () => {
    expect(intakeSteps({ gate: closed, status: undefined }, ASSIGNEE)).toEqual([]);
    expect(intakeSteps({ gate: closed, status: "DRAFT", version: 2 }, ASSIGNEE)).toEqual([]);
    expect(intakeSteps({ gate: closed, status: "OWNER_CONFIRMED", ownerState: "CONFIRMED", ownerCheck: "DONE" }, ASSIGNEE)).toEqual([]);
  });

  it("steps_gateClosed_noWayPast: a block with no gate reads as closed", () => {
    expect(intakeSteps({ status: "DRAFT" }, ASSIGNEE)).toEqual([]);
  });

  it("steps_gateClosed_noWayPast: a completed result stays readable behind a closed gate, with nothing to act on", () => {
    const block: IntakeBlock = { gate: closed, status: "COMPLETED", result: { propertyCode: "SV-1" } };
    expect(intakeSteps(block, ASSIGNEE)).toEqual([{ name: "result", mode: "read" }]);
  });

  it("starts at the selection, as D5-9 orders it", () => {
    expect(intakeSteps({ gate: open, version: null }, ASSIGNEE)).toEqual([{ name: "selection", mode: "act" }]);
  });

  it("asks for the owner after the selection, and keeps the selection open to change", () => {
    const block: IntakeBlock = { gate: open, status: "DRAFT", version: 1, ownerState: "NONE" };
    expect(names(block)).toEqual(["selection", "owner"]);
    expect(acting(block)).toEqual(["selection", "owner"]);
  });

  it("can ask again while waiting", () => {
    const block: IntakeBlock = { gate: open, status: "AWAITING_OWNER", version: 2, ownerState: "WAITING" };
    expect(acting(block)).toEqual(["selection", "owner"]);
  });

  it("waits for the check after the owner confirms, and offers no target before it", () => {
    const block: IntakeBlock = { gate: open, status: "OWNER_CONFIRMED", ownerState: "CONFIRMED", ownerCheck: "REQUIRED" };
    expect(names(block)).toEqual(["selection", "owner", "ownerCheck"]);
    expect(acting(block)).toEqual(["selection"]);
  });

  it("offers the target once the check is done", () => {
    const block: IntakeBlock = { gate: open, status: "OWNER_CONFIRMED", ownerState: "CONFIRMED", ownerCheck: "DONE" };
    expect(names(block)).toEqual(["selection", "owner", "ownerCheck", "target"]);
  });

  it("offers availability after the target, and the preview only when every part has its row", () => {
    const base: IntakeBlock = {
      gate: open,
      status: "OWNER_CONFIRMED",
      ownerState: "CONFIRMED",
      ownerCheck: "DONE",
      selection: { spaceIds: ["S1", "S2"] },
      target: { mode: "CREATE" },
    };
    expect(names(base).slice(-2)).toEqual(["target", "availability"]);
    expect(names({ ...base, availability: [{ spaceId: "S1" }] })).not.toContain("preview");
    expect(names({ ...base, availability: [{ spaceId: "S1" }, { spaceId: "S2" }] }).at(-1)).toBe("preview");
  });

  it("offers the preview to the assignee alone: the server refuses it to anyone else", () => {
    const block: IntakeBlock = {
      gate: open,
      status: "OWNER_CONFIRMED",
      ownerState: "CONFIRMED",
      ownerCheck: "DONE",
      selection: { spaceIds: ["S1"] },
      target: { mode: "CREATE" },
      availability: [{ spaceId: "S1" }],
    };
    expect(names(block)).toContain("preview");
    expect(names(block, OTHER)).not.toContain("preview");
  });

  it("holds at the manager check while a case stands, with the selection still open", () => {
    const block: IntakeBlock = { gate: open, status: "CASE_OPEN", ownerState: "CONFIRMED", ownerCheck: "DONE", caseState: "OPEN" };
    expect(names(block)).toEqual(["selection", "owner", "ownerCheck", "case"]);
    expect(acting(block)).toEqual(["selection"]);
  });

  it("shows the result of a completed intake", () => {
    expect(names({ gate: open, status: "COMPLETED", result: { propertyCode: "SV-1" } })).toEqual(["result"]);
  });

  it("offers commands to the assignee only", () => {
    const block: IntakeBlock = { gate: open, status: "DRAFT", ownerState: "NONE" };
    expect(names(block, OTHER)).toEqual(["selection", "owner"]);
    expect(acting(block, OTHER)).toEqual([]);
  });

  it("steps_afterMark_earlierResultAndLink: after a mark a lead starts over from the selection", () => {
    const block: IntakeBlock = { gate: open, status: undefined, version: null, earlierResult: { propertyCode: "SV-HOU-1" } };
    expect(names(block)).toContain("selection");
    expect(targetModes(block)).toEqual(["LINK"]);
  });

  it("steps_afterMark_earlierResultAndLink: the earlier result stays readable with its readiness (spec 4.1)", () => {
    const ended: IntakeBlock = {
      gate: open,
      status: undefined,
      version: null,
      earlierResult: { propertyCode: "SV-HOU-1" },
      readiness: { state: "ENDED", reasons: ["REQUALIFIED"] },
    };
    expect(intakeSteps(ended, ASSIGNEE)).toEqual([
      { name: "result", mode: "read" },
      { name: "selection", mode: "act" },
    ]);
  });

  it("steps_gateClosed_noWayPast: an ended result stays readable behind a closed gate", () => {
    const ended: IntakeBlock = { gate: closed, earlierResult: { propertyCode: "SV-1" }, readiness: { state: "ENDED", reasons: ["REQUALIFIED"] } };
    expect(intakeSteps(ended, ASSIGNEE)).toEqual([{ name: "result", mode: "read" }]);
  });

  it("shows no result with no readiness to read", () => {
    expect(names({ gate: open, readiness: { state: "NONE" } })).toEqual(["selection"]);
  });
});

describe("restoration", () => {
  const lost: IntakeBlock = {
    gate: open,
    status: "COMPLETED",
    result: { propertyCode: "SV-1" },
    readiness: { state: "SUSPENDED", reasons: ["OWNER_NOT_CONFIRMED"] },
    ownerState: "NONE",
    ownerCheck: "NONE",
  };

  it("result_restorationWhenReasonCalls: stays out of a result that stands", () => {
    expect(restorationView({ ...lost, readiness: { state: "USABLE", reasons: [] } })).toBe("none");
    expect(restorationView({ ...lost, readiness: { state: "SUSPENDED", reasons: ["LEAD_ON_HOLD"] } })).toBe("none");
    expect(restorationView({ ...lost, status: "OWNER_CONFIRMED" })).toBe("none");
  });

  it("result_restorationWhenReasonCalls: stays out behind a closed gate: a held lead resumes first", () => {
    expect(restorationView({ ...lost, gate: closed })).toBe("none");
    expect(names({ ...lost, gate: closed })).toEqual(["result"]);
  });

  it("result_restorationWhenReasonCalls: a lost confirmation asks for a new one", () => {
    expect(restorationView(lost)).toBe("needs-confirmation");
    expect(restorationView({ ...lost, ownerState: "WAITING" })).toBe("needs-confirmation");
    expect(intakeSteps(lost, ASSIGNEE)).toEqual([
      { name: "result", mode: "read" },
      { name: "owner", mode: "act" },
    ]);
  });

  it("result_restorationWhenReasonCalls: a new confirmation waits for its owner check", () => {
    const confirmed: IntakeBlock = { ...lost, ownerState: "CONFIRMED", ownerCheck: "REQUIRED" };
    expect(restorationView(confirmed)).toBe("needs-check");
    expect(names(confirmed)).toEqual(["result", "ownerCheck"]);
  });

  it("result_restorationWhenReasonCalls: a checked confirmation can restore, for the assignee only", () => {
    const checked: IntakeBlock = { ...lost, ownerState: "CONFIRMED", ownerCheck: "DONE" };
    expect(restorationView(checked)).toBe("ready");
    expect(intakeSteps(checked, ASSIGNEE)).toEqual([
      { name: "result", mode: "read" },
      { name: "restoration", mode: "act" },
    ]);
    expect(names(checked, OTHER)).toEqual(["result"]);
  });
});

describe("targetModes", () => {
  it("offers both ways to an intake with nothing that binds it", () => {
    expect(targetModes({ gate: open })).toEqual(["CREATE", "LINK"]);
  });

  it("steps_earlierResult_createHidden: an earlier result leaves only the link", () => {
    expect(targetModes({ earlierResult: { propertyCode: "SV-HOU-1" } })).toEqual(["LINK"]);
  });

  it("steps_earlierResult_createHidden: a forced property leaves only the link", () => {
    expect(targetModes({ forcedPropertyCode: "SV-HOU-1" })).toEqual(["LINK"]);
  });

  it("an earlier result with no code binds nothing", () => {
    expect(targetModes({ earlierResult: { propertyCode: null } })).toEqual(["CREATE", "LINK"]);
  });
});
