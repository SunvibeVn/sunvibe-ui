import { WORKSPACE_HOME } from "@/features/workspace";

import type { SurveyGroup } from "../types";

const GROUPS: readonly SurveyGroup[] = ["OVERDUE", "TODAY", "UPCOMING"];

export type SurveySection<T> = { group: SurveyGroup; items: T[] };

/**
 * The rows of a page as sections under their group header, in the API order (A-11: sorted by group, start, id); a
 * new section starts whenever the group changes. A row with no known group shows under Upcoming.
 */
export function groupSurveyRows<T extends { group?: string | null }>(rows: readonly (T | null)[]): SurveySection<T>[] {
  const sections: SurveySection<T>[] = [];
  for (const row of rows) {
    if (row === null) continue;
    const group = GROUPS.find((known) => known === row.group) ?? "UPCOMING";
    const last = sections.at(-1);
    if (last?.group === group) last.items.push(row);
    else sections.push({ group, items: [row] });
  }
  return sections;
}

/** The lead detail at its Survey section (the list's "View"). */
export function surveyLeadHref(leadId: string): string {
  return `${WORKSPACE_HOME}/${encodeURIComponent(leadId)}#survey`;
}
