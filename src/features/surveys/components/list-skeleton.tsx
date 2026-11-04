"use client";

import { useTranslations } from "next-intl";

/** The loading state of the lists of `/workspace/surveys`. */
export function ListSkeleton() {
  const t = useTranslations("Surveys");
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <span className="sr-only">{t("loading")}</span>
      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden className="h-16 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      ))}
    </div>
  );
}
