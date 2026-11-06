"use client";

import { useTranslations } from "next-intl";

import { decisionPanelModel } from "../../lib/checklist/status-model";

import { useChecklistPage } from "./checklist-context";
import { useChecklistMedia } from "./media-context";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-3 sm:gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-slate-900 sm:col-span-2">{value}</dd>
    </div>
  );
}

/**
 * The decision of a revision for every lead viewer (survey-checklist submission spec 6.1): outcome, kind, reviewer, date,
 * reason, notes, limitations and the photos not accepted, then why a pass was withdrawn from use. Only on this page: the
 * review and requalification text stays out of History, lists, titles and URLs (`survey BR-4`).
 */
export function DecisionPanel() {
  const t = useTranslations("OwnerLeads");
  const { view } = useChecklistPage();
  const media = useChecklistMedia();
  const model = decisionPanelModel(view, t, (mediaId) => media?.itemOf(mediaId) ?? null);
  if (model === null) return null;
  const mark = model.requalification;
  return (
    <section aria-labelledby="cl-decision-title" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id="cl-decision-title" className="text-base font-semibold text-slate-900">
        {t("checklist.decision.title")}
      </h2>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label={t("checklist.decision.outcome")} value={model.outcome} />
        <Row label={t("checklist.decision.reviewer")} value={model.reviewer} />
        <Row label={t("checklist.decision.date")} value={model.when} />
        {model.reason !== null && <Row label={t("checklist.decision.reason")} value={model.reason} />}
        {model.notes !== null && <Row label={t("checklist.decision.notes")} value={model.notes} />}
        {model.limitations !== null && <Row label={t("checklist.decision.limitations")} value={model.limitations} />}
      </dl>
      {model.marks.length > 0 && (
        <div className="mt-4 space-y-1 text-sm">
          <h3 className="font-semibold text-slate-900">{t("checklist.decision.marks")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-800">
            {model.marks.map((mark) => (
              <li key={mark.mediaId} className="break-words">
                {t("checklist.decision.mark", { photo: mark.photo, reason: mark.reason })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {model.passedNotes.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-slate-700">
          {model.passedNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {mark !== null && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-900">{t("checklist.requalification.title")}</h3>
          <dl className="mt-2 space-y-2 text-sm">
            <Row label={t("checklist.requalification.kind")} value={mark.kind} />
            <Row label={t("checklist.requalification.reason")} value={mark.reason} />
            <Row label={t("checklist.requalification.source")} value={mark.source} />
            <Row label={t("checklist.requalification.scope")} value={mark.scope} />
            <Row label={t("checklist.requalification.basisDate")} value={mark.basisDate} />
            <Row label={t("checklist.requalification.markedBy")} value={mark.markedBy} />
            <Row label={t("checklist.requalification.markedAt")} value={mark.markedAt} />
          </dl>
        </div>
      )}
    </section>
  );
}
