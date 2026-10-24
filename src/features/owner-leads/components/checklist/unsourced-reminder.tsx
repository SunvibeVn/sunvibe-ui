"use client";

import { useTranslations } from "next-intl";

import { useChecklistPage } from "./checklist-context";

/**
 * The reminder beside unsourced inputs other than notes (survey-checklist spec 6.2, BR-23, A-22): what is typed there
 * counts as seen at this visit by its performer.
 */
export function UnsourcedReminder() {
  const t = useTranslations("OwnerLeads");
  const { view } = useChecklistPage();
  return (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {t("checklist.reminder.unsourced", {
        no: view.visit?.appointmentNo ?? "",
        performer: view.visit?.performedByName?.trim() || t("survey.unknownPerson"),
      })}
    </p>
  );
}
