"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import type { ChecklistHazardInput, ChecklistInput } from "@/features/surveys";

import { earlierHazardRows, linkedEntry, newHazard } from "../../lib/checklist/entries";
import { fieldAnchor } from "../../lib/checklist/readiness-view";
import { problemsUnder } from "../../lib/checklist/unit-path";
import { unitKey } from "../../lib/checklist/units";
import type { ChecklistProblems } from "../../schemas/checklist";

import { useChecklistPage } from "./checklist-context";
import { checklistProblemText } from "./checklist-copy";
import { FieldControl } from "./field-control";
import { GroupPanel } from "./group-panel";
import { HazardEditor } from "./hazard-editor";
import { Provenance } from "./provenance";
import { UnsourcedReminder } from "./unsourced-reminder";
import { usePanel } from "./use-panel";

type ListChoice = "UNKNOWN" | "NONE" | "LIST";

/**
 * G5 Access and risks (survey-checklist spec 6.2, 4.6.1, BR-18, BR-24): ways in and out, access restrictions, the
 * hazards (none seen, or a list with severity, status and owner fix reports) and the risks from earlier checklists,
 * whose "Record status at this visit" adds a linked entry that starts empty (A-22).
 */
export function SafetyPanel() {
  const t = useTranslations("OwnerLeads");
  const page = useChecklistPage();
  const panel = usePanel("safety");
  const groupId = useId();
  const input = panel.input as ChecklistInput["safety"];
  const hazards = (input.hazards.state === "VALUE" ? input.hazards.value : null) ?? [];
  const choice: ListChoice = input.hazards.state !== "VALUE" ? "UNKNOWN" : hazards.length === 0 ? "NONE" : "LIST";
  const earlier = earlierHazardRows(page.view, hazards);
  const earlierOf = (hazard: ChecklistHazardInput) => {
    if (!hazard.previous) return null;
    const row = earlier.find((entry) => entry.checklistId === hazard.previous?.checklistId && entry.hazardId === hazard.previous?.hazardId);
    return { checklistNo: row?.checklistNo ?? null, description: row?.hazard.description ?? "" };
  };

  const choose = (next: ListChoice) => {
    const removals = hazards.map((hazard) => [unitKey.hazard(hazard.hazardId), null] as const);
    if (next === "UNKNOWN") panel.setUnits([...removals, [unitKey.hazardList, { state: "UNKNOWN", naReason: null }]]);
    else if (next === "NONE") panel.setUnits([...removals, [unitKey.hazardList, { state: "VALUE", naReason: null }]]);
    else if (hazards.length === 0) {
      const added = newHazard(null);
      panel.setUnit(unitKey.hazard(added.hazardId), added, true);
    }
  };

  return (
    <GroupPanel panel={panel} no={5}>
      {(problems: ChecklistProblems) => (
        <div className="space-y-4">
          <UnsourcedReminder />
          <FieldControl panel={panel} unitKey={unitKey.field("safety", "egress")} field="egress" kind={{ kind: "text", max: 1000, rows: 2 }} problems={problems} />
          <FieldControl
            panel={panel}
            unitKey={unitKey.field("safety", "accessRestrictions")}
            field="accessRestrictions"
            kind={{ kind: "observation" }}
            problems={problems}
          />

          <fieldset id={fieldAnchor("safety", null, "hazards")} className="scroll-mt-36 md:scroll-mt-20 space-y-3 rounded-lg border border-slate-200 p-3" disabled={panel.locked}>
            <legend className="px-1 text-sm font-semibold text-slate-800">{t("checklist.fields.hazards")}</legend>
            <div role="radiogroup" aria-label={t("checklist.fields.hazards")} className="flex flex-wrap gap-2">
              {(["LIST", "NONE", "UNKNOWN"] as const).map((value) => (
                <label
                  key={value}
                  className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                    choice === value ? "border-violet-600 bg-violet-50 text-violet-800" : "border-slate-300 text-slate-700"
                  }`}
                >
                  <input type="radio" className="accent-violet-600" name={`${groupId}-hazards`} checked={choice === value} onChange={() => choose(value)} />
                  {value === "LIST" ? t("checklist.fields.hazardsList") : value === "NONE" ? t("checklist.fields.hazardsNone") : t("checklist.states.UNKNOWN")}
                </label>
              ))}
            </div>
            <Provenance
              unit={{ state: (panel.storedUnits.get(unitKey.hazardList) as { state?: string } | undefined)?.state }}
              meta={panel.metas.get(unitKey.hazardList)}
            />
            {problemsUnder(problems, "content.hazards.value")[""] !== undefined && (
              <p className="text-sm text-rose-600">{checklistProblemText(t, problemsUnder(problems, "content.hazards.value")[""])}</p>
            )}
            {hazards.map((hazard) => (
              <HazardEditor key={hazard.hazardId} panel={panel} hazard={hazard} earlier={earlierOf(hazard)} problems={problems} />
            ))}
            {hazards.length < 30 && (
              <Button
                variant="secondary"
                onClick={() => {
                  const added = newHazard(null);
                  panel.setUnit(unitKey.hazard(added.hazardId), added, true);
                }}
              >
                {t("checklist.safety.addHazard")}
              </Button>
            )}
          </fieldset>

          {earlier.length > 0 && (
            <section className="space-y-2 rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-800">{t("checklist.safety.earlierTitle")}</h3>
              <ul className="space-y-2 text-sm">
                {earlier.map((row) => (
                  <li key={`${row.checklistId}-${row.hazardId}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="min-w-0 break-words text-slate-900">
                      {t("checklist.safety.earlierItem", { no: row.checklistNo ?? "", description: row.hazard.description ?? "" })}
                    </span>
                    <span className="text-slate-600">
                      {row.state.kind === "resolved"
                        ? t("checklist.safety.resolvedAt", { no: row.state.checklistNo })
                        : row.state.kind === "carried"
                          ? t("checklist.safety.carriedTo", { no: row.state.checklistNo })
                          : t("checklist.safety.earlierOpen")}
                    </span>
                    {!row.linkedHere && (
                      <Button
                        variant="ghost"
                        className="px-3 py-1"
                        disabled={panel.locked}
                        onClick={() => {
                          const added = linkedEntry({ checklistId: row.checklistId, hazardId: row.hazardId });
                          panel.setUnit(unitKey.hazard(added.hazardId), added, true);
                        }}
                      >
                        {t("checklist.safety.recordStatus")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-xs text-amber-700">{t("checklist.safety.rule")}</p>
        </div>
      )}
    </GroupPanel>
  );
}
