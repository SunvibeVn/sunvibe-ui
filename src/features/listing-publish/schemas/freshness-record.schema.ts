import { z } from "zod";

// The contact the assigned Sale records (listing-publish US-6 AC-1, BR-9, E06S3-D4, D10), as the server checks
// ListingFreshnessRecordRequest. Each issue's message is the problem of its field, read as `freshness.form.errors.<code>`.
// The server stays the authority: a browser whose Unicode tables differ from Java 21's can still let a 400 through.

/** The edge bound of the note in UTF-16 units, checked before it is normalized (`@Size`, FreshnessNote.EDGE_UNITS). */
export const NOTE_EDGE_UNITS = 2000;
/** The note's bound in code points after normalization (FreshnessNote.MAX_CODE_POINTS, ASSUMPTION A-1). */
export const NOTE_MAX_CODE_POINTS = 500;

/**
 * What the server trims from both ends of the note (RevisionContent.normalized): Java's `Character.isWhitespace` or
 * `isSpaceChar`, so the separators Zs, Zl and Zp, U+0009 to U+000D and U+001C to U+001F; never U+FEFF.
 */
const TRIMMED = /^[\p{Zs}\p{Zl}\p{Zp}\t\n\v\f\r\u001C-\u001F]$/u;
/** A control character other than LF, or a format character: the note cannot hold one. */
const NOT_STORABLE = /(?!\n)[\p{Cc}\p{Cf}]/u;

/** The note as the server stores it: NFC, CR LF and a lone CR as LF, the ends trimmed; an empty result is no note. */
export function normalizedNote(note: string): string | null {
  const points = [...note.normalize("NFC").replace(/\r\n?/g, "\n")];
  let start = 0;
  let end = points.length;
  while (start < end && TRIMMED.test(points[start] as string)) start += 1;
  while (end > start && TRIMMED.test(points[end - 1] as string)) end -= 1;
  const text = points.slice(start, end).join("");
  return text === "" ? null : text;
}

/** The note's two constraints in the server's order: the edge bound first, then `@StorableFreshnessNote`. */
const note = z.string().superRefine((value, context) => {
  if (value.length > NOTE_EDGE_UNITS) {
    context.addIssue({ code: "custom", message: "noteTooLong" });
    return;
  }
  const normalized = normalizedNote(value);
  if (normalized === null) return;
  if ([...normalized].length > NOTE_MAX_CODE_POINTS) context.addIssue({ code: "custom", message: "noteTooLong" });
  if (NOT_STORABLE.test(normalized)) context.addIssue({ code: "custom", message: "noteCharacters" });
});

export const freshnessRecordSchema = z
  .object({
    channel: z.enum(["CALL", "MESSAGE", "IN_PERSON"], { error: "channel" }),
    outcome: z.enum(["AVAILABLE", "NOT_AVAILABLE", "UNREACHABLE"], { error: "outcome" }),
    termsStillApply: z.boolean().nullable(),
    unitUnchanged: z.boolean().nullable(),
    note,
  })
  // "Still available" needs both answers of BR-9, a "No" being an answer (E06S3-D4 (b)); the request builder sends no
  // answer for another result.
  .superRefine((values, context) => {
    if (values.outcome !== "AVAILABLE") return;
    if (values.termsStillApply === null) context.addIssue({ code: "custom", path: ["termsStillApply"], message: "answer" });
    if (values.unitUnchanged === null) context.addIssue({ code: "custom", path: ["unitUnchanged"], message: "answer" });
  });

export type FreshnessRecordInput = z.output<typeof freshnessRecordSchema>;
