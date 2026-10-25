"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/format/vietnam-time";

import { useChecklistPage } from "./checklist-context";

/**
 * The takeovers of the checklist (survey-checklist spec 6.2): kind, from, to, reason, basis and time, with "View
 * snapshot" for each takeover that kept one (a start by someone else has none).
 */
export function TakeoversList({ onViewSnapshot }: { onViewSnapshot(takeoverNo: number): void }) {
  const t = useTranslations("OwnerLeads");
  const { view } = useChecklistPage();
  const takeovers = view.takeovers ?? [];
  if (takeovers.length === 0) return null;
  const person = (name: string | null | undefined) => name?.trim() || t("survey.unknownPerson");
  return (
    <section aria-labelledby="takeovers-title" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id="takeovers-title" className="text-base font-semibold text-slate-900">
        {t("checklist.takeover.listTitle")}
      </h2>
      <ul className="mt-3 space-y-3">
        {takeovers.map((takeover) => (
          <li key={takeover.takeoverNo} className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <p className="font-medium text-slate-900">
              {t("checklist.takeover.item", {
                kind: t(`checklist.takeover.kind.${takeover.kind ?? "TAKEOVER"}`),
                no: takeover.takeoverNo ?? "",
                when: takeover.occurredAt ? formatDateTime(takeover.occurredAt) : "",
              })}
            </p>
            <p className="text-slate-700">
              {takeover.fromUserId
                ? t("checklist.takeover.fromTo", { from: person(takeover.fromName), to: person(takeover.toName) })
                : t("checklist.takeover.to", { to: person(takeover.toName) })}
            </p>
            <p className="break-words text-slate-700">{t("checklist.takeover.reasonLine", { reason: takeover.reason ?? "" })}</p>
            <p className="break-words text-slate-700">
              {t("checklist.takeover.basisLine", {
                date: takeover.basis?.confirmedOn ? formatDate(takeover.basis.confirmedOn) : "",
                text: takeover.basis?.text ?? "",
              })}
            </p>
            {takeover.hasSnapshot === true && typeof takeover.takeoverNo === "number" && (
              <Button variant="secondary" onClick={() => onViewSnapshot(takeover.takeoverNo as number)}>
                {t("checklist.takeover.viewSnapshot")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
