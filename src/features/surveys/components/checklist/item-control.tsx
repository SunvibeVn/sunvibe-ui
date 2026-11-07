"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";

import { needsRelayBasis, receiverOptions } from "../../lib/checklist/receiver-options";
import { problemsUnder, unitPath } from "../../lib/checklist/unit-path";
import type { ChecklistProblems } from "../../schemas/checklist";
import { SurveyTextField } from "../survey/survey-text-field";

import { useChecklistPage } from "./checklist-context";
import { checklistProblemText } from "./checklist-copy";
import { Provenance } from "./provenance";
import type { Panel } from "./use-panel";

type Item = {
  presence: "YES" | "NO";
  source: "OBSERVED_ON_SITE" | "OWNER_STATED";
  confirmedOn: string | null;
  receivedByUserId: string | null;
  relayBasis: string | null;
};

/**
 * The presence and source of a G6 item or other item (survey-checklist spec 4.6): "Seen on site" or "Owner said" with
 * the date, who heard it (nothing preselected) and "How it reached you" when it names someone else (W16-45).
 */
export function ItemControl({ panel, unitKey, problems }: { panel: Panel; unitKey: string; problems: ChecklistProblems }) {
  const t = useTranslations("OwnerLeads");
  const { view, userId, rules } = useChecklistPage();
  const id = useId();
  const item = panel.units.get(unitKey) as Item | undefined;
  if (item === undefined) return null;
  const stored = panel.storedUnits.get(unitKey) as Item | undefined;
  const rel = problemsUnder(problems, unitPath(panel.group, panel.input as never, unitKey));
  const error = (path: string, kind: "text" | "date" = "text", max?: number) =>
    rel[path] === undefined ? undefined : checklistProblemText(t, rel[path], kind, max);
  const set = (patch: Partial<Item>) => panel.setUnit(unitKey, { ...item, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`${id}-presence`} label={t("checklist.fields.presence")} error={error("presence")}>
          <Select id={`${id}-presence`} value={item.presence} onChange={(event) => set({ presence: event.target.value as Item["presence"] })}>
            <option value="YES">{t("checklist.values.yesNo.YES")}</option>
            <option value="NO">{t("checklist.values.yesNo.NO")}</option>
          </Select>
        </FormField>
        <FormField id={`${id}-source`} label={t("checklist.sources.label")} error={error("source")}>
          <Select
            id={`${id}-source`}
            value={item.source}
            onChange={(event) => {
              const source = event.target.value as Item["source"];
              set(source === "OWNER_STATED" ? { source } : { source, confirmedOn: null, receivedByUserId: null, relayBasis: null });
            }}
          >
            <option value="OBSERVED_ON_SITE">{t("checklist.sources.OBSERVED_ON_SITE")}</option>
            <option value="OWNER_STATED">{t("checklist.sources.OWNER_STATED")}</option>
          </Select>
        </FormField>
      </div>
      {item.source === "OWNER_STATED" && (
        <div className="space-y-3 rounded-lg bg-white p-3">
          <SurveyTextField
            id={`${id}-said`}
            type="date"
            max={rules.today}
            required
            label={t("checklist.receiver.confirmedOn")}
            value={item.confirmedOn ?? ""}
            onChange={(confirmedOn) => set({ confirmedOn: confirmedOn === "" ? null : confirmedOn })}
            error={error("confirmedOn", "date")}
          />
          <FormField
            id={`${id}-receiver`}
            label={t("checklist.receiver.label")}
            required
            error={error("receivedByUserId") ?? (needsRelayBasis(stored, item, userId) ? undefined : error("relayBasis", "text", 500))}
            hint={t("checklist.receiver.nobodyListed")}
          >
            <Select
              id={`${id}-receiver`}
              value={item.receivedByUserId ?? ""}
              aria-describedby={describedBy(`${id}-receiver`, error("receivedByUserId"), true)}
              onChange={(event) =>
                set({
                  receivedByUserId: event.target.value === "" ? null : event.target.value,
                  relayBasis: event.target.value === userId ? null : item.relayBasis,
                })
              }
            >
              <option value="">{t("checklist.receiver.placeholder")}</option>
              {receiverOptions(view.leadStaff ?? [], userId).map((option) => (
                <option key={option.userId} value={option.userId}>
                  {option.me ? t("checklist.receiver.me") : option.name?.trim() || t("survey.unknownPerson")}
                </option>
              ))}
            </Select>
          </FormField>
          {needsRelayBasis(stored, item, userId) && (
            <SurveyTextField
              id={`${id}-relay`}
              label={t("checklist.receiver.relay")}
              rows={2}
              required
              value={item.relayBasis ?? ""}
              onChange={(relayBasis) => set({ relayBasis })}
              error={error("relayBasis", "text", 500)}
            />
          )}
        </div>
      )}
      {stored && <Provenance unit={{ state: "VALUE", source: stored.source, relayBasis: stored.relayBasis }} meta={panel.metas.get(unitKey)} />}
    </div>
  );
}
