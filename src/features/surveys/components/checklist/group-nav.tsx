"use client";

import { useTranslations } from "next-intl";

const GROUPS = ["identification", "parts", "dimensions", "condition", "safety", "amenities", "evidence", "terms"] as const;

/**
 * The group navigation G1..G8 of the Edit tab (survey-checklist spec 6.2): sticky at the top on phones, so a group is
 * one tap away while scrolling a long draft (W16-33).
 */
export function GroupNav({ idPrefix }: { idPrefix: string }) {
  const t = useTranslations("OwnerLeads");
  return (
    <nav
      aria-label={t("checklist.page.groupNav")}
      className="sticky top-16 z-30 -mx-4 overflow-x-auto border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:rounded-xl md:border md:px-3"
    >
      <ol className="flex gap-2 text-sm">
        {GROUPS.map((group, index) => (
          <li key={group} className="shrink-0">
            <a
              href={`#${idPrefix}-${group}`}
              className="inline-flex min-h-9 items-center rounded-full px-3 py-1 font-medium text-violet-700 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
            >
              {`G${index + 1} ${t(`checklist.groups.${group.toUpperCase() as "TERMS"}`)}`}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
