import type { ChecklistHazard, ChecklistHazardInput, ChecklistOtherItemInput, ChecklistView } from "@/features/surveys";

import { newClientId } from "./client-id";

// New list entries of G5 and G6 and the "Risks from earlier checklists" list (survey-checklist spec 6.2, 4.6.1, A-20,
// A-22, A-23, A-29).

export type EarlierState = { kind: "open" } | { kind: "resolved"; checklistNo: number } | { kind: "carried"; checklistNo: number };

export type EarlierHazardRow = {
  checklistId: string;
  checklistNo: number | null;
  hazardId: string;
  hazard: ChecklistHazard;
  state: EarlierState;
  /** This checklist already holds an entry linked to it (each earlier hazard is linked at most once). */
  linkedHere: boolean;
};

/**
 * Each important or unclassified earlier hazard of the cycle as recorded, with its addressed state: "Seen resolved at
 * checklist #m" when any RESOLVED link exists, else "Carried to checklist #m" for a CARRIED link, else open.
 */
export function earlierHazardRows(
  view: ChecklistView,
  current: readonly { previous?: { checklistId?: string; hazardId?: string } | null }[] = view.groups?.safety?.content?.hazards?.value ?? [],
): EarlierHazardRow[] {
  return (view.earlierHazards ?? []).map((entry) => {
    const links = entry.addressedBy ?? [];
    const resolved = links.find((link) => link.kind === "RESOLVED");
    const carried = links.find((link) => link.kind === "CARRIED");
    const state: EarlierState = resolved
      ? { kind: "resolved", checklistNo: resolved.checklistNo ?? 0 }
      : carried
        ? { kind: "carried", checklistNo: carried.checklistNo ?? 0 }
        : { kind: "open" };
    const checklistId = entry.checklistId ?? "";
    const hazardId = entry.hazard?.hazardId ?? "";
    return {
      checklistId,
      checklistNo: entry.checklistNo ?? null,
      hazardId,
      hazard: entry.hazard ?? {},
      state,
      linkedHere: current.some((hazard) => hazard.previous?.checklistId === checklistId && hazard.previous?.hazardId === hazardId),
    };
  });
}

/** A new hazard with a new client id; "Not sure yet" until the Sale classifies it (it counts as important). */
export function newHazard(spaceId: string | null): ChecklistHazardInput {
  return {
    hazardId: newClientId(),
    spaceId,
    previous: null,
    description: "",
    severity: "UNCLASSIFIED",
    status: "OPEN",
    statusNote: null,
    ownerReportedOn: null,
    receivedByUserId: null,
    relayBasis: null,
  };
}

/**
 * "Record status at this visit" of an earlier hazard: a linked entry with a new id and an empty description; the
 * earlier description is shown beside it read-only and nothing is copied (A-22, BR-23).
 */
export function linkedEntry(previous: { checklistId: string; hazardId: string }): ChecklistHazardInput {
  return { ...newHazard(null), previous };
}

/** A new other item of G6 with a new client id: never the id of an item removed before (A-29). */
export function newOtherItem(): ChecklistOtherItemInput {
  return {
    itemId: newClientId(),
    label: "",
    spaceId: null,
    presence: "YES",
    source: "OBSERVED_ON_SITE",
    confirmedOn: null,
    receivedByUserId: null,
    relayBasis: null,
  };
}
