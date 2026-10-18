/** Longest note the API takes (acquisition-owner-lead-queue: note 1..2000). */
export const NOTE_MAX = 2000;

/**
 * Length in UTF-16 code units, which is what the server counts (Java `String.length`) and the intake form shows. An
 * emoji is two units; `[...s].length` would count one and let a too long note through.
 */
export function utf16Length(text: string): number {
  return text.length;
}

export type NoteProblem = "required" | "tooLong";

/** A note must have a visible character and at most `NOTE_MAX` units; null when it is fine. */
export function noteProblem(text: string): NoteProblem | null {
  if (text.trim() === "") return "required";
  return utf16Length(text) > NOTE_MAX ? "tooLong" : null;
}
