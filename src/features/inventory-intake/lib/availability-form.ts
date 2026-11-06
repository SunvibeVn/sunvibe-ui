import type { AvailabilityState, IntakeAvailabilityInput, IntakeBlock } from "../types";

import { cleanText, NOTE_MAX, type TextProblem, textProblem } from "./intake-text";

// The availability step (property-create intake 4.9): what the owner said about each selected part. No state stands for
// "no contact" (E-14), and the server wants the contact to be today at completion.

export type AvailabilityRow = {
  spaceId: string;
  state: AvailabilityState | "";
  /** `yyyy-MM-dd`, Vietnam. */
  contactedOn: string;
  note: string;
  expectedDate: string;
};

export type RowProblems = { state?: "required"; contactedOn?: "required" | "tooLate"; note?: TextProblem };

/** Space id -> what is wrong with its row; only rows with a problem. */
export type AvailabilityProblems = Readonly<Record<string, RowProblems>>;

/** One row per selected space, as the block holds it, with today for a new one. */
export function availabilityRows(block: IntakeBlock, today: string): AvailabilityRow[] {
  const stored = new Map((block.availability ?? []).map((row) => [row.spaceId, row]));
  return (block.selection?.spaceIds ?? []).map((spaceId) => {
    const row = stored.get(spaceId);
    return {
      spaceId,
      state: row?.state ?? "",
      contactedOn: row?.contactedOn ?? today,
      note: row?.note ?? "",
      expectedDate: row?.expectedDate ?? "",
    };
  });
}

function rowProblems(row: AvailabilityRow, today: string): RowProblems {
  const problems: RowProblems = {};
  if (row.state === "") problems.state = "required";
  if (row.contactedOn === "") problems.contactedOn = "required";
  else if (row.contactedOn > today) problems.contactedOn = "tooLate";
  const note = textProblem(row.note, NOTE_MAX);
  if (note !== null) problems.note = note;
  return problems;
}

/** `{}` when every row can be sent. */
export function availabilityProblems(rows: readonly AvailabilityRow[], today: string): AvailabilityProblems {
  const problems: Record<string, RowProblems> = {};
  for (const row of rows) {
    const found = rowProblems(row, today);
    if (Object.keys(found).length > 0) problems[row.spaceId] = found;
  }
  return problems;
}

/** The body of checked rows: every row at once, as the server wants. */
export function availabilityBody(rows: readonly AvailabilityRow[], block: Pick<IntakeBlock, "version">): IntakeAvailabilityInput {
  return {
    expectedVersion: block.version ?? undefined,
    items: rows.map((row) => ({
      spaceId: row.spaceId,
      state: row.state as AvailabilityState,
      contactedOn: row.contactedOn,
      note: cleanText(row.note),
      ...(row.expectedDate === "" ? {} : { expectedDate: row.expectedDate }),
    })),
  };
}
