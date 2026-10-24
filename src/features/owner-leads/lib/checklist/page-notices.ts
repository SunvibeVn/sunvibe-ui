// The banners of the checklist page and the reminder beside unsourced inputs (survey-checklist spec 6.2, section 8,
// US-2 AC-4, BR-23, A-22).

/** The newest earlier checklist of this intent cycle, on an earlier visit: survey #k holds checklist #m. */
export type EarlierChecklist = { appointmentNo: number; checklistNo: number };

export type PageNotices = {
  /** "Site survey record. It is not a legal or safety check." on every view. */
  legal: true;
  /** "Photos and submission open once survey photos are available. ..." on every view. */
  media: true;
  /** The starts-empty banner of a draft on a later visit; there is no copy control (A-22). */
  laterVisit: { surveyNo: number; checklistNo: number } | null;
};

type BlockLike = {
  appointments?: ReadonlyArray<{
    appointmentNo?: number | null;
    status?: string | null;
    intentCycle?: number | null;
    checklists?: ReadonlyArray<{ checklistNo?: number | null } | null> | null;
  } | null> | null;
};

/**
 * The newest checklist of an earlier VISITED appointment of the same intent cycle, for the starts-empty banner of a
 * draft on a later visit (BR-23); null on the first visit with a checklist.
 */
export function earlierChecklist(
  block: BlockLike,
  view: { checklistNo?: number; visit?: { appointmentNo?: number; intentCycle?: number } },
): EarlierChecklist | null {
  const no = view.visit?.appointmentNo ?? 0;
  let found: EarlierChecklist | null = null;
  for (const entry of block.appointments ?? []) {
    if (!entry || entry.status !== "VISITED" || entry.intentCycle !== view.visit?.intentCycle) continue;
    const appointmentNo = entry.appointmentNo ?? 0;
    if (appointmentNo >= no || (found !== null && appointmentNo <= found.appointmentNo)) continue;
    const numbers = (entry.checklists ?? [])
      .map((checklist) => checklist?.checklistNo ?? 0)
      .filter((value) => value > 0 && value < (view.checklistNo ?? 0));
    if (numbers.length > 0) found = { appointmentNo, checklistNo: Math.max(...numbers) };
  }
  return found;
}

export function pageNotices({ earlier }: { earlier: EarlierChecklist | null }): PageNotices {
  return {
    legal: true,
    media: true,
    laterVisit: earlier === null ? null : { surveyNo: earlier.appointmentNo, checklistNo: earlier.checklistNo },
  };
}

/** Unsourced inputs attributed to the visit as on-site observations (spec 4.6); notes and sourced fields excluded. */
const UNSOURCED = new Set([
  "propertyType",
  "fit",
  "rentalScope",
  "spaces",
  "accessRoute",
  "sharedAreas",
  "floor",
  "privateAreas",
  "actualAccess",
  "occupancy",
  "mainSpace",
  "kitchen",
  "bathroom",
  "sharedKitchen",
  "sharedBathroom",
  "egress",
  "accessRestrictions",
  "hazards",
]);

/** True beside an unsourced input other than a note: what is typed there counts as seen at this visit (BR-23). */
export function showsUnsourcedReminder(field: string): boolean {
  return UNSOURCED.has(field);
}
