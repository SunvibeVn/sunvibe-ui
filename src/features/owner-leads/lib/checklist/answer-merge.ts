import { CHECKLIST_GROUP_PATHS, type ChecklistGroupPath, type ChecklistOtherGroupVersions, type ChecklistView } from "@/features/surveys";

/** What applying an answer gives: the screen's next state, the groups taken, and whether to read again. */
export type AnswerMerge = { view: ChecklistView; applied: ChecklistGroupPath[]; needsReload: boolean };

const versionOf = (view: ChecklistView, group: ChecklistGroupPath): number => view.groups?.[group]?.version ?? -1;

/**
 * Applies a checklist answer to the screen (spec 6.2): parallel saves of different groups may answer out of order, so
 * each group is taken only when its version is at least the one on screen, and the computed parts (readiness,
 * effective terms, earlier hazards, editors, corrections, takeovers, holder, editability, `updatedAt`) only from an
 * answer whose every group is at least the screen's; otherwise the page reads the checklist again (W16-27).
 */
export function applyAnswer(screen: ChecklistView, answer: ChecklistView): AnswerMerge {
  const applied = CHECKLIST_GROUP_PATHS.filter((group) => versionOf(answer, group) >= versionOf(screen, group));
  if (applied.length === CHECKLIST_GROUP_PATHS.length) {
    const taken = applied.filter((group) => versionOf(answer, group) > versionOf(screen, group));
    // Nothing newer (a late or repeated answer; a takeover raises the checklist version): the screen stays.
    if (taken.length === 0 && (answer.version ?? 0) <= (screen.version ?? 0)) return { view: screen, applied: [], needsReload: false };
    return { view: answer, applied: taken, needsReload: false };
  }
  const groups = { ...screen.groups };
  for (const group of applied) Object.assign(groups, { [group]: answer.groups?.[group] });
  const taken = applied.filter((group) => versionOf(answer, group) > versionOf(screen, group));
  return { view: { ...screen, groups }, applied: taken, needsReload: true };
}

/** The versions on screen of the six groups a G1 save may change (A-12); the server ignores the ones it leaves alone. */
export function otherGroupVersions(view: ChecklistView): ChecklistOtherGroupVersions {
  return {
    parts: versionOf(view, "parts"),
    dimensions: versionOf(view, "dimensions"),
    condition: versionOf(view, "condition"),
    safety: versionOf(view, "safety"),
    amenities: versionOf(view, "amenities"),
    terms: versionOf(view, "terms"),
  };
}
