"use client";

import { useTranslations } from "next-intl";

import type { SurveyOverlap } from "@/features/surveys";
import { formatDateTime } from "@/lib/format/vietnam-time";

/** The overlapping appointments as a warning; nothing when there are none. Also used for a save answer's overlaps. */
export function OverlapList({ overlaps }: { overlaps: readonly NonNullable<SurveyOverlap>[] }) {
  const t = useTranslations("OwnerLeads");
  if (overlaps.length === 0) return null;
  return (
    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-semibold">{t("survey.overlap.title")}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {overlaps.map((item, index) => (
          <li key={item.appointmentId ?? index}>
            {t("survey.overlap.item", {
              code: item.requestCode ?? "",
              time: item.startAt ? formatDateTime(item.startAt) : "",
              minutes: item.durationMinutes ?? 0,
            })}
          </li>
        ))}
      </ul>
      <p className="mt-1">{t("survey.overlap.text")}</p>
    </div>
  );
}
