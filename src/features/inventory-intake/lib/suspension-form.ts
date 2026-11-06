import type { IntakeBlock, IntakeReleaseInput, IntakeSuspensionInput } from "../types";

import { cleanText, REASON_MAX, type TextProblem, textProblem } from "./intake-text";

// Manual suspensions (property-create intake 4.11, D5-16): a manager records one, for the whole lead or one unit of its
// result, and another release ends it. The reason stays here: History and the readiness state carry no free text.

export type SuspensionRow = { id: string | undefined; unitCode: string | null; reason: string | null; createdAt: string | null };

/** The active suspensions; `reason` is left out for an assignee who is a manager. */
export function suspensionRows(block: Pick<IntakeBlock, "suspensions">): SuspensionRow[] {
  return (block.suspensions ?? []).map((row) => ({
    id: row.id,
    unitCode: row.unitCode ?? null,
    reason: row.reason ?? null,
    createdAt: row.createdAt ?? null,
  }));
}

/** The units of the result a suspension can name. */
export function suspendableUnits(block: Pick<IntakeBlock, "readiness">): { unitId: string; unitCode: string }[] {
  return (block.readiness?.units ?? []).flatMap((unit) =>
    unit.unitId && unit.unitCode ? [{ unitId: unit.unitId, unitCode: unit.unitCode }] : [],
  );
}

export function suspensionProblem(reason: string): TextProblem | null {
  return textProblem(reason, REASON_MAX);
}

export function suspensionBody(form: { unitId: string; reason: string }, block: Pick<IntakeBlock, "version">): IntakeSuspensionInput {
  return {
    ...(form.unitId === "" ? {} : { unitId: form.unitId }),
    reason: cleanText(form.reason),
    expectedVersion: block.version ?? undefined,
  };
}

export function releaseProblem(reason: string): TextProblem | null {
  return textProblem(reason, REASON_MAX);
}

export function releaseBody(reason: string, block: Pick<IntakeBlock, "version">): IntakeReleaseInput {
  return { releaseReason: cleanText(reason), expectedVersion: block.version ?? undefined };
}
