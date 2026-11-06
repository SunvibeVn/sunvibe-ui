import type { IntakeBlock } from "../types";

// Which steps of the intake page show for a block (property-create intake spec 6.1, D5-9): gate, selection, owner, owner
// check, target, availability, preview, result. The server decides every command again; this only keeps a screen from
// offering what would be refused. There is no "skip" anywhere: a closed gate leaves no step at all.

export type StepName =
  | "selection"
  | "owner"
  | "ownerCheck"
  | "target"
  | "availability"
  | "preview"
  | "case"
  | "result"
  | "restoration";

/** `act`: this viewer may use the step now; `read`: it shows with no command. */
export type StepMode = "act" | "read";

export type IntakeStep = { name: StepName; mode: StepMode };

/** Each selected space has a row of availability, and `PUT /availability` takes them all at once. */
function availabilityComplete(block: IntakeBlock): boolean {
  const selected = block.selection?.spaceIds ?? [];
  const rows = new Set((block.availability ?? []).map((row) => row.spaceId));
  return selected.length > 0 && selected.every((spaceId) => rows.has(spaceId));
}

/** How far a result that lost its owner's confirmation is from coming back (spec 4.11). */
export type RestorationView = "none" | "needs-confirmation" | "needs-check" | "ready";

/**
 * A completed intake reading `OWNER_NOT_CONFIRMED` comes back by a new confirmation, its owner check and a restoration.
 * Restoration checks the gate too, so a held lead resumes first and nothing is offered before that.
 */
export function restorationView(block: IntakeBlock): RestorationView {
  if (block.status !== "COMPLETED" || block.gate?.ready !== true) return "none";
  if (!(block.readiness?.reasons ?? []).includes("OWNER_NOT_CONFIRMED")) return "none";
  if (block.ownerState !== "CONFIRMED") return "needs-confirmation";
  return block.ownerCheck === "DONE" ? "ready" : "needs-check";
}

/** A result from an earlier row: it stays readable with its readiness, ended or not (spec 4.1, 4.11). */
function hasEarlierReadiness(block: IntakeBlock): boolean {
  const state = block.readiness?.state;
  return block.status !== "COMPLETED" && Boolean(block.earlierResult) && state !== undefined && state !== "NONE";
}

/** The steps of the block for a viewer, in order. Only the lead's assignee acts (spec 4.3). */
export function intakeSteps(block: IntakeBlock, viewer: { assignee: boolean }): IntakeStep[] {
  const act = (name: StepName): IntakeStep => ({ name, mode: viewer.assignee ? "act" : "read" });
  const read = (name: StepName): IntakeStep => ({ name, mode: "read" });

  if (block.status === "COMPLETED") {
    switch (restorationView(block)) {
      case "needs-confirmation":
        return [read("result"), act("owner")];
      case "needs-check":
        return [read("result"), read("ownerCheck")];
      case "ready":
        return viewer.assignee ? [read("result"), act("restoration")] : [read("result")];
      case "none":
        return [read("result")];
    }
  }
  const earlier = hasEarlierReadiness(block) ? [read("result")] : [];
  if (block.gate?.ready !== true) return earlier;
  if (!block.status) return [...earlier, act("selection")];
  if (block.status === "DRAFT" || block.status === "AWAITING_OWNER") return [...earlier, act("selection"), act("owner")];

  const steps = [...earlier, act("selection"), read("owner"), read("ownerCheck")];
  if (block.status === "CASE_OPEN") return [...steps, read("case")];
  if (block.ownerState !== "CONFIRMED" || block.ownerCheck !== "DONE") return steps;

  steps.push(act("target"));
  if (block.target) {
    steps.push(act("availability"));
    if (viewer.assignee && availabilityComplete(block)) steps.push(act("preview"));
  }
  return steps;
}

/**
 * The targets this intake may take: a property the block binds it to leaves only a link to that property (D5-12, spec
 * 4.8), so CREATE is not offered at all.
 */
export function targetModes(block: IntakeBlock): readonly ("CREATE" | "LINK")[] {
  return block.earlierResult?.propertyCode || block.forcedPropertyCode ? ["LINK"] : ["CREATE", "LINK"];
}
