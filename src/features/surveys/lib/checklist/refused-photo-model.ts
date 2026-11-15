import type { OwnerLeadsTranslate } from "@/features/lead-shared";

import type { ChecklistRefusedPhoto, ChecklistView } from "../../types";
import { photoPair } from "./preview-model";

// The refused photos of a revision as lines (survey-checklist SV-310): the photos a decision on an earlier revision of the
// visit did not accept and whose image a frozen photo repeats (RU-1, the Review tab), and those of the previous revision
// this revision does not hold (RU-2, the Photos group). The server computes both lists; they keep its order. The reason
// is a private reviewer text (survey BR-4): it is shown here and nowhere else. An answer without the lists shows nothing.

export type RefusedPhotoLine = { key: string; text: string };

/** The item key of a refused photo: the revision that refused it and the photo. */
function keyOf(photo: ChecklistRefusedPhoto): string {
  return `${photo.checklistId ?? ""}:${photo.mediaId ?? ""}`;
}

function lines(
  photos: readonly ChecklistRefusedPhoto[] | undefined,
  text: (photo: ChecklistRefusedPhoto, pair: string) => string,
  t: OwnerLeadsTranslate,
): RefusedPhotoLine[] {
  return (photos ?? []).flatMap((photo) => {
    if (!photo.mediaId) return [];
    return [{ key: keyOf(photo), text: text(photo, photoPair(photo.spaceCode ?? null, photo.category ?? null, t)) }];
  });
}

/** The flag lines of each frozen photo, keyed by its media id; only photos with at least one line. */
export function sameContentLines(view: ChecklistView, t: OwnerLeadsTranslate): Record<string, RefusedPhotoLine[]> {
  const byPhoto: Record<string, RefusedPhotoLine[]> = {};
  for (const entry of view.submission?.evidence ?? []) {
    if (!entry.mediaId) continue;
    const found = lines(
      entry.refusedSameContent,
      (photo, pair) =>
        t("checklist.review.evidence.sameContent", { no: photo.checklistNo ?? "", pair, reason: photo.reason ?? "" }),
      t,
    );
    if (found.length > 0) byPhoto[entry.mediaId] = found;
  }
  return byPhoto;
}

/** The lines of the refused photos of the previous revision that this revision does not hold. */
export function notCarriedLines(view: ChecklistView, t: OwnerLeadsTranslate): RefusedPhotoLine[] {
  return lines(
    view.media?.refusedNotCarried,
    (photo, pair) => t("checklist.media.notCarried.line", { no: photo.checklistNo ?? "", pair, reason: photo.reason ?? "" }),
    t,
  );
}
