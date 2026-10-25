"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { spaceCodes } from "../../lib/checklist/readiness-view";

import { useChecklistPage } from "./checklist-context";

/**
 * The per-space part of a group: one block per saved G1 space, in G1 order (survey-checklist spec 4.6). Before G1 has
 * saved spaces, it says so: the other groups follow the saved spaces only.
 */
export function SpaceSections({ children }: { children: (spaceId: string) => ReactNode }) {
  const t = useTranslations("OwnerLeads");
  const { ctx, view } = useChecklistPage();
  const codes = spaceCodes(view);
  if (ctx.spaces.length === 0) return <p className="text-sm text-slate-600">{t("checklist.identification.saveG1First")}</p>;
  return (
    <div className="space-y-4">
      {ctx.spaces.map((spaceId) => (
        <section key={spaceId} className="space-y-3 rounded-xl bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-slate-800">{t("checklist.preview.space", { code: codes.get(spaceId) ?? "" })}</h3>
          {children(spaceId)}
        </section>
      ))}
    </div>
  );
}
