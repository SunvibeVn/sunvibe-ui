"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { fieldAnchor } from "../../lib/checklist/readiness-view";
import { problemsUnder, unitPath } from "../../lib/checklist/unit-path";
import { spaceIdOfKey } from "../../lib/checklist/units";
import type { ChecklistProblems } from "../../schemas/checklist";
import { SurveyTextField } from "../survey/survey-text-field";

import { checklistProblemText } from "./checklist-copy";
import { Provenance } from "./provenance";
import type { Panel } from "./use-panel";

/**
 * An authored note (survey-checklist A-26): the writer's words, shown as "Note by <name>, dd/MM/yyyy" and never as
 * seen on site; it changes without a correction. Blank counts as none.
 */
export function NoteField({
  panel,
  unitKey,
  field,
  max,
  rows = 3,
  problems,
}: {
  panel: Panel;
  unitKey: string;
  field: string;
  max: number;
  rows?: number;
  problems: ChecklistProblems;
}) {
  const t = useTranslations("OwnerLeads");
  const id = useId();
  const value = panel.units.get(unitKey);
  const rel = problemsUnder(problems, unitPath(panel.group, panel.input as never, unitKey));
  const stored = panel.storedUnits.get(unitKey);
  return (
    <div id={fieldAnchor(panel.group, spaceIdOfKey(unitKey), field)} className="scroll-mt-36 md:scroll-mt-20 space-y-1">
      <SurveyTextField
        id={id}
        label={t(`checklist.fields.${field}` as "checklist.fields.generalNote")}
        optional
        rows={rows}
        value={typeof value === "string" ? value : ""}
        onChange={(next) => panel.setUnit(unitKey, next.trim() === "" ? null : next)}
        error={rel[""] === undefined ? undefined : checklistProblemText(t, rel[""], "text", max)}
      />
      <Provenance unit={{ state: stored ? "VALUE" : "UNKNOWN", note: true }} meta={stored ? panel.metas.get(unitKey) : null} />
    </div>
  );
}
