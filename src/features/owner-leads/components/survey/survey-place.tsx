"use client";

import { useTranslations } from "next-intl";

import type { SurveyLocation } from "@/features/surveys";

import { mapDirectionsUrl } from "../../lib/map-link";

const MAP_LINK =
  "inline-flex min-h-11 items-center text-sm font-medium text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 sm:min-h-0";

/**
 * A place of an appointment: address and ward, and a map link only when it has a pin. Nothing is requested from the
 * map service before the click (spec 6.1).
 */
export function SurveyPlace({ location }: { location: SurveyLocation | null | undefined }) {
  const t = useTranslations("OwnerLeads");
  if (location === null || location === undefined) return <span className="text-slate-500">—</span>;
  const { latitude, longitude } = location;
  const pinned = typeof latitude === "number" && typeof longitude === "number";
  const place = [location.addressText?.trim(), location.wardName?.trim()].filter(Boolean).join(", ");
  return (
    <span className="flex flex-wrap items-baseline gap-x-3">
      <span className="break-words">{place || "—"}</span>
      {pinned && (
        <a href={mapDirectionsUrl(latitude, longitude)} target="_blank" rel="noopener noreferrer" className={MAP_LINK}>
          {t("survey.showMap")}
        </a>
      )}
    </span>
  );
}
