import type { MediaCategory } from "@/features/surveys";

import { cleanText, optionalText, type SurveyProblem } from "../../schemas/survey/survey-text";

import { type CoverageRow, MEDIA_CATEGORIES } from "./media-panel-model";

// The upload form's rules (survey-media spec 6.2 Upload): the categories allowed at a placement come from the list's
// coverage (every allowed pair, SHARED_* only in PARTS, A-12); the caption is optional, 1..200 characters without a
// phone number (A-11). Size and place counts are hints only: the server decides.

export const CAPTION_MAX = 200;

const captionSchema = optionalText(CAPTION_MAX);

/** The categories of `coverage` at the placement (`spaceId` null: the asset), in the order of spec 4.6. */
export function categoriesFor(coverage: readonly CoverageRow[], spaceId: string | null): MediaCategory[] {
  const allowed = new Set(coverage.filter((row) => row.spaceId === spaceId).map((row) => row.category));
  return MEDIA_CATEGORIES.filter((category) => allowed.has(category));
}

/** The caption as sent (null for blank) or its problem. */
export function captionInput(text: string): { caption: string | null; problem: SurveyProblem | null } {
  const result = captionSchema.safeParse(text);
  if (!result.success) return { caption: null, problem: (result.error.issues[0]?.message ?? "invalid") as SurveyProblem };
  const caption = cleanText(text);
  return { caption: caption === "" ? null : caption, problem: null };
}

/** Bytes in MB with at most one decimal ("20", "2.3"). */
export function megabytes(bytes: number): string {
  const value = Math.max(0.1, Math.round((bytes / 1_048_576) * 10) / 10);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Places left under the cap of selected photos (BR-6). */
export function remainingPlaces(limits: { maxSelected: number; selectedCount: number }): number {
  return Math.max(0, limits.maxSelected - limits.selectedCount);
}
