"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import type { RefusedPhotoLine } from "../../lib/checklist/refused-photo-model";

/**
 * The photos of the previous revision that a reviewer did not accept and that this revision does not hold
 * (survey-checklist SV-310 RU-2, SV310-D4), in the Photos group of every mode. A titled region that informs: not an
 * alert or a status (it does not change while the page is open), and no h4 (the photo grid's group headings are h4).
 */
export function NotCarriedNotice({ lines }: { lines: readonly RefusedPhotoLine[] }) {
  const t = useTranslations("OwnerLeads");
  const titleId = useId();
  if (lines.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <h3 id={titleId} className="font-semibold">
        {t("checklist.media.notCarried.title")}
      </h3>
      <p>{t("checklist.media.notCarried.text")}</p>
      <ul className="list-disc space-y-1 pl-5">
        {lines.map((line) => (
          <li key={line.key} className="break-words">
            {line.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
