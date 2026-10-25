"use client";

import { useTranslations } from "next-intl";

import type { ChecklistUnitMeta } from "@/features/surveys";

import { formatProvenance, provenanceLine, type ProvenanceUnit } from "../../lib/checklist/provenance-line";

import { useChecklistPage } from "./checklist-context";

/** The provenance lines of a stored unit (survey-checklist spec 6.2); nothing for a unit never filled. */
export function Provenance({ unit, meta }: { unit: ProvenanceUnit; meta: ChecklistUnitMeta | null | undefined }) {
  const t = useTranslations("OwnerLeads");
  const { view } = useChecklistPage();
  const lines = formatProvenance(provenanceLine(unit, meta, view.visit, view.corrections ?? []), t);
  if (lines.length === 0) return null;
  return (
    <div className="space-y-0.5 text-xs text-slate-500">
      {lines.map((line) => (
        <p key={line} className="break-words">
          {line}
        </p>
      ))}
    </div>
  );
}
