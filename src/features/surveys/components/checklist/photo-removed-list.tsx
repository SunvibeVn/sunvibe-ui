"use client";

import { useTranslations } from "next-intl";

import { formatDateTime } from "@/lib/format/vietnam-time";

import type { MediaPanelModel } from "../../lib/checklist/media-panel-model";

import { usePairText } from "./use-pair-text";

/** Removed photos, apart and without images, with who removed them and when (survey-media spec 6.2, 4.7). */
export function PhotoRemovedList({ model }: { model: MediaPanelModel }) {
  const t = useTranslations("OwnerLeads");
  const pair = usePairText();
  if (model.removed.length === 0) return null;
  return (
    <section aria-labelledby="photo-removed-title" className="space-y-2">
      <h3 id="photo-removed-title" className="text-sm font-semibold text-slate-900">
        {t("checklist.media.removed.title")}
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
        {model.removed.map((photo) => (
          <li key={photo.id} className="break-words">
            {t(photo.kind === "CASCADE" ? "checklist.media.removed.cascade" : "checklist.media.removed.line", {
              no: photo.mediaNo,
              pair: pair(photo.spaceCode, photo.category),
              name: photo.byName ?? t("checklist.media.grid.unknownName"),
              when: photo.at ? formatDateTime(photo.at) : "",
            })}
          </li>
        ))}
      </ul>
      {model.moreRemoved > 0 && <p className="text-xs text-slate-500">{t("checklist.media.removed.more", { count: model.moreRemoved })}</p>}
    </section>
  );
}
