"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import type { ChecklistHazardInput } from "@/features/surveys";

import { spaceCodes } from "../../lib/checklist/readiness-view";
import { needsRelayBasis, receiverOptions } from "../../lib/checklist/receiver-options";
import { problemsUnder, unitPath } from "../../lib/checklist/unit-path";
import { unitKey } from "../../lib/checklist/units";
import type { ChecklistProblems } from "../../schemas/checklist";
import { SurveyTextField } from "../survey/survey-text-field";

import { useChecklistPage } from "./checklist-context";
import { checklistProblemText } from "./checklist-copy";
import { Provenance } from "./provenance";
import type { Panel } from "./use-panel";

const SEVERITIES = ["IMPORTANT", "MINOR", "UNCLASSIFIED"] as const;
const STATUSES = ["OPEN", "OWNER_REPORTED_FIXED", "OBSERVED_RESOLVED"] as const;

type HazardEditorProps = {
  panel: Panel;
  hazard: ChecklistHazardInput;
  /** For a linked entry: the earlier checklist number and description, shown beside it read-only (A-22). */
  earlier: { checklistNo: number | null; description: string } | null;
  problems: ChecklistProblems;
};

/**
 * One hazard (survey-checklist spec 4.6.1, 6.2): description, severity, status ("Owner says fixed" with date,
 * receiver and relay as for "Owner said"), status note and space. A linked entry starts with an empty description and
 * shows the earlier one beside it, read-only.
 */
export function HazardEditor({ panel, hazard, earlier, problems }: HazardEditorProps) {
  const t = useTranslations("OwnerLeads");
  const { view, userId, rules, ctx } = useChecklistPage();
  const id = useId();
  const key = unitKey.hazard(hazard.hazardId);
  const stored = panel.storedUnits.get(key) as ChecklistHazardInput | undefined;
  const rel = problemsUnder(problems, unitPath("safety", panel.input as never, key));
  const error = (path: string, kind: "text" | "date" = "text", max?: number) =>
    rel[path] === undefined ? undefined : checklistProblemText(t, rel[path], kind, max);
  const codes = spaceCodes(view);
  const set = (patch: Partial<ChecklistHazardInput>) => panel.setUnit(key, { ...hazard, ...patch });
  const reported = hazard.status === "OWNER_REPORTED_FIXED";

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      {earlier !== null && (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <p className="font-medium text-slate-800">{t("checklist.safety.linkedTo", { no: earlier.checklistNo ?? "" })}</p>
          <p className="text-slate-600">
            {t("checklist.safety.earlierDescription")}: {earlier.description}
          </p>
        </div>
      )}
      <SurveyTextField
        id={`${id}-description`}
        label={t("checklist.fields.hazardDescription")}
        required
        rows={2}
        value={hazard.description}
        onChange={(description) => set({ description })}
        error={error("description", "text", 500)}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id={`${id}-severity`} label={t("checklist.fields.hazardSeverity")} error={error("severity")}>
          <Select id={`${id}-severity`} value={hazard.severity} onChange={(event) => set({ severity: event.target.value as ChecklistHazardInput["severity"] })}>
            {SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {t(`checklist.values.severity.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id={`${id}-status`} label={t("checklist.fields.hazardStatus")} error={error("status")}>
          <Select
            id={`${id}-status`}
            value={hazard.status}
            onChange={(event) => {
              const status = event.target.value as ChecklistHazardInput["status"];
              set(
                status === "OWNER_REPORTED_FIXED"
                  ? { status }
                  : { status, ownerReportedOn: null, receivedByUserId: null, relayBasis: null, statusNote: status === "OPEN" ? null : hazard.statusNote },
              );
            }}
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`checklist.values.status.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id={`${id}-space`} label={t("checklist.fields.hazardSpace")} error={error("spaceId")}>
          <Select id={`${id}-space`} value={hazard.spaceId ?? ""} onChange={(event) => set({ spaceId: event.target.value === "" ? null : event.target.value })}>
            <option value="">{t("checklist.fields.wholeProperty")}</option>
            {ctx.spaces.map((spaceId) => (
              <option key={spaceId} value={spaceId}>
                {codes.get(spaceId) ?? spaceId}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      {hazard.status !== "OPEN" && (
        <SurveyTextField
          id={`${id}-note`}
          label={t("checklist.fields.hazardStatusNote")}
          required
          rows={2}
          value={hazard.statusNote ?? ""}
          onChange={(statusNote) => set({ statusNote })}
          error={error("statusNote", "text", 500)}
        />
      )}
      {reported && (
        <div className="space-y-3 rounded-lg bg-slate-50 p-3">
          <SurveyTextField
            id={`${id}-reported`}
            type="date"
            max={rules.today}
            required
            label={t("checklist.fields.ownerReportedOn")}
            value={hazard.ownerReportedOn ?? ""}
            onChange={(ownerReportedOn) => set({ ownerReportedOn: ownerReportedOn === "" ? null : ownerReportedOn })}
            error={error("ownerReportedOn", "date")}
          />
          <FormField
            id={`${id}-receiver`}
            label={t("checklist.receiver.label")}
            required
            error={error("receivedByUserId") ?? (needsRelayBasis(stored, hazard, userId) ? undefined : error("relayBasis", "text", 500))}
            hint={t("checklist.receiver.nobodyListed")}
          >
            <Select
              id={`${id}-receiver`}
              value={hazard.receivedByUserId ?? ""}
              aria-describedby={describedBy(`${id}-receiver`, error("receivedByUserId"), true)}
              onChange={(event) =>
                set({
                  receivedByUserId: event.target.value === "" ? null : event.target.value,
                  relayBasis: event.target.value === userId ? null : hazard.relayBasis,
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
          {needsRelayBasis(stored, hazard, userId) && (
            <SurveyTextField
              id={`${id}-relay`}
              label={t("checklist.receiver.relay")}
              rows={2}
              required
              value={hazard.relayBasis ?? ""}
              onChange={(relayBasis) => set({ relayBasis })}
              error={error("relayBasis", "text", 500)}
            />
          )}
        </div>
      )}
      {stored && <Provenance unit={{ state: "VALUE" }} meta={panel.metas.get(key)} />}
      <Button variant="ghost" className="px-3 py-1" onClick={() => panel.setUnit(key, null)}>
        {t("checklist.safety.removeHazard")}
      </Button>
    </div>
  );
}
