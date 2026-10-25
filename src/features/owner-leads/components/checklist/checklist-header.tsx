"use client";

import { useTranslations } from "next-intl";

import { formatDateTime } from "@/lib/format/vietnam-time";

import { useChecklistPage } from "./checklist-context";

/**
 * The checklist header (survey-checklist spec 6.2): lead code, the visit as it was recorded (performer, arrival,
 * a manager's proxy record), the template, the holder and the editors. Nothing here says the owner reconfirmed
 * anything (schedule R-17).
 */
export function ChecklistHeader() {
  const t = useTranslations("OwnerLeads");
  const { view } = useChecklistPage();
  const visit = view.visit;
  const person = (name: string | null | undefined) => name?.trim() || t("survey.unknownPerson");
  const editors = (view.editors ?? []).map((editor) => person(editor.name)).join(", ");
  return (
    <header className="space-y-1">
      <p className="text-sm font-medium text-slate-500">{view.lead?.requestCode ?? ""}</p>
      <h1 className="text-xl font-semibold text-slate-900">{t("checklist.page.heading", { no: view.checklistNo ?? "" })}</h1>
      <p className="text-sm text-slate-700">
        {t("checklist.page.surveyLine", {
          no: visit?.appointmentNo ?? "",
          when: visit?.arrivedAt ? formatDateTime(visit.arrivedAt) : "",
          name: person(visit?.performedByName),
        })}
      </p>
      {visit?.recordKind === "PROXY" && (
        <p className="text-sm text-slate-700">
          {t("checklist.page.proxyRecord", {
            name: person(visit.recordedByName),
            when: visit.recordedAt ? formatDateTime(visit.recordedAt) : "",
          })}
        </p>
      )}
      <p className="text-sm text-slate-600">{t("checklist.page.template", { version: view.templateVersion ?? 1 })}</p>
      <p className="text-sm text-slate-600">
        {t("checklist.page.holder", { name: person(view.holderName) })}
        {editors !== "" && ` · ${t("checklist.page.editors", { names: editors })}`}
      </p>
    </header>
  );
}
