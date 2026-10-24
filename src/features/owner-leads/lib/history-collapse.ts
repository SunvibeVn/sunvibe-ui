import type { LeadActivity } from "../types";

import { formatDateTime } from "./format";
import { HISTORY_ACTOR_KEY } from "./history-actor";
import type { OwnerLeadsTranslate } from "./history-activity-text";

/** One row of the history table: an entry as it is, or a run of checklist saves shown as one expandable line. */
export type HistoryRow =
  | { kind: "entry"; entry: LeadActivity; no: number }
  | {
      kind: "saves";
      checklistNo: number;
      count: number;
      /** The actor's name, or null when the entries carry none (shown as "Unknown"). */
      actorName: string | null;
      firstAt: string;
      lastAt: string;
      /** The row number of the first save; the run covers `firstNo` .. `firstNo + count - 1`. */
      firstNo: number;
      entries: LeadActivity[];
    };

function sameRun(a: LeadActivity, b: LeadActivity): boolean {
  return (
    b.type === "CHECKLIST_SAVED" &&
    typeof b.referenceNo === "number" &&
    a.actorUserId === b.actorUserId &&
    a.referenceId === b.referenceId
  );
}

/**
 * Collapses consecutive CHECKLIST_SAVED entries of one actor on one checklist into one row (survey-checklist A-21).
 * A single save and every other entry stay rows of their own; every entry keeps its row number, so the expanded line
 * lists each save as the table would.
 */
export function collapseChecklistSaves(entries: readonly LeadActivity[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let index = 0;
  while (index < entries.length) {
    const first = entries[index];
    let end = index + 1;
    if (first.type === "CHECKLIST_SAVED" && typeof first.referenceNo === "number" && first.referenceId) {
      while (end < entries.length && sameRun(first, entries[end])) end += 1;
    }
    if (end - index >= 2) {
      const run = entries.slice(index, end);
      const named = run.find((entry) => entry.actorName?.trim());
      rows.push({
        kind: "saves",
        checklistNo: first.referenceNo as number,
        count: run.length,
        actorName: named?.actorName ?? null,
        firstAt: first.occurredAt ?? "",
        lastAt: run[run.length - 1].occurredAt ?? "",
        firstNo: index + 1,
        entries: run,
      });
    } else {
      rows.push({ kind: "entry", entry: first, no: index + 1 });
    }
    index = end;
  }
  return rows;
}

/** `HH:mm` in Vietnam time, "" when unreadable. */
function vietnamTime(iso: string): string {
  return formatDateTime(iso).slice(11);
}

/** "Checklist #2: 3 saves by <name> (09:05–09:40)", times in Vietnam time (survey-checklist spec 6.1). */
export function collapsedSavesText(row: Extract<HistoryRow, { kind: "saves" }>, t: OwnerLeadsTranslate): string {
  const name = row.actorName ?? t(HISTORY_ACTOR_KEY.unknown);
  return t("history.checklistSaves", {
    no: row.checklistNo,
    count: row.count,
    name,
    from: vietnamTime(row.firstAt),
    to: vietnamTime(row.lastAt),
  });
}
