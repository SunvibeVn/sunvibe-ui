import type { IntakeBlock, IntakeSpace, SelectionInput } from "../types";

// The selection step (property-create intake 4.5): WHOLE takes its one space, PARTS 1..50 of the surveyed spaces.

export const SELECTION_MAX = 50;

/** What the step starts from: the stored selection, or the one space of a whole property. */
export function initialSelection(block: IntakeBlock): string[] {
  const stored = block.selection?.spaceIds;
  if (stored !== undefined) return [...stored];
  const spaces = block.source?.spaces ?? [];
  const only = spaces[0]?.spaceId;
  return block.source?.rentalScope === "WHOLE" && spaces.length === 1 && only !== undefined ? [only] : [];
}

/** One part on or off, kept in the order of the source; anything outside the source cannot be chosen. */
export function toggleSpace(selected: readonly string[], spaceId: string, block: IntakeBlock): string[] {
  const order = (block.source?.spaces ?? []).flatMap((space) => (space.spaceId === undefined ? [] : [space.spaceId]));
  if (!order.includes(spaceId)) return [...selected];
  const next = new Set(selected);
  if (!next.delete(spaceId)) next.add(spaceId);
  return order.filter((id) => next.has(id));
}

export function selectionProblem(selected: readonly string[]): "required" | "tooMany" | null {
  if (selected.length === 0) return "required";
  return selected.length > SELECTION_MAX ? "tooMany" : null;
}

export function selectionBody(selected: readonly string[], block: Pick<IntakeBlock, "version">): SelectionInput {
  return { spaceIds: [...selected], expectedVersion: block.version ?? null };
}

/**
 * Whether the chosen parts differ from the stored selection: always on a first save, otherwise when they are not the
 * same set in any order. The server answers the same parts again with no change (property-create SV-202).
 */
export function selectionChanged(selected: readonly string[], block: Pick<IntakeBlock, "selection">): boolean {
  const stored = block.selection?.spaceIds;
  if (stored === undefined) return true;
  const chosen = new Set(selected);
  const kept = new Set(stored);
  return chosen.size !== kept.size || [...kept].some((spaceId) => !chosen.has(spaceId));
}

/** The selected spaces of the source, in its order. */
export function selectedSpaces(block: IntakeBlock): IntakeSpace[] {
  const selected = new Set(block.selection?.spaceIds ?? []);
  return (block.source?.spaces ?? []).filter((space) => space.spaceId !== undefined && selected.has(space.spaceId));
}

export function spaceLabel(space: Pick<IntakeSpace, "code" | "location">): string {
  return [space.code, space.location].filter(Boolean).join(" · ");
}
