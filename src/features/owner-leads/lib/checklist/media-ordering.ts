import type { ChecklistView, MediaList } from "@/features/surveys";

// Ordering of photo lists (survey-media spec 6.2 Polling, SV-004): polls, uploads and saves answer out of order, so a
// list is applied only when none of its versions is lower than what the page shows, and a list that is newer than the
// checklist read on screen makes the page read the checklist again (its readiness counts the photos).

export type ListDecision = { apply: boolean; rereadChecklist: boolean };

type Versions = { setVersion: number; identification: number; condition: number; checklist: number };

const NONE = -1;

function ofList(list: MediaList | null): Versions {
  return {
    setVersion: list?.setVersion ?? NONE,
    identification: list?.basis?.identificationVersion ?? NONE,
    condition: list?.basis?.conditionVersion ?? NONE,
    checklist: list?.basis?.checklistVersion ?? NONE,
  };
}

function ofView(view: ChecklistView | null): Versions {
  return {
    setVersion: view?.media?.setVersion ?? NONE,
    identification: view?.groups?.identification?.version ?? NONE,
    condition: view?.groups?.condition?.version ?? NONE,
    checklist: view?.version ?? NONE,
  };
}

/** Whether `incoming` may replace the list on screen, and whether the checklist read must be repeated. */
export function listDecision(screen: { view: ChecklistView | null; list: MediaList | null }, incoming: MediaList): ListDecision {
  const next = ofList(incoming);
  const list = ofList(screen.list);
  const view = ofView(screen.view);
  // "Shown" is the newest the page knows of each version, from the list on screen or the checklist read.
  const shown: Versions = {
    setVersion: Math.max(list.setVersion, view.setVersion),
    identification: Math.max(list.identification, view.identification),
    condition: Math.max(list.condition, view.condition),
    checklist: Math.max(list.checklist, view.checklist),
  };
  const apply =
    next.setVersion >= shown.setVersion &&
    next.identification >= shown.identification &&
    next.condition >= shown.condition &&
    next.checklist >= shown.checklist;
  const rereadChecklist =
    screen.view !== null && (next.setVersion > view.setVersion || next.checklist > view.checklist);
  return { apply, rereadChecklist };
}
