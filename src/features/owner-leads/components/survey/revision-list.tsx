"use client";

import { useTranslations } from "next-intl";

import type { SurveyRevision } from "@/features/surveys";
import { formatDateTime } from "@/lib/format/vietnam-time";

import { SurveyPlace } from "./survey-place";

/** The revisions of an appointment (values, reason, by, at), oldest first as the API sends them (spec 6.1). */
export function RevisionList({ revisions }: { revisions: readonly SurveyRevision[] }) {
  const t = useTranslations("OwnerLeads");
  const list = revisions.filter((revision): revision is NonNullable<SurveyRevision> => revision !== null);
  if (list.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("survey.revisions.title")}</p>
      <ol className="space-y-2">
        {list.map((revision, index) => (
          <li key={revision.revisionNo ?? index} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
            <p className="font-medium text-slate-900">
              {t("survey.revisions.item", { no: revision.revisionNo ?? index + 1 })}
              {" · "}
              {t("survey.personTime", {
                name: revision.actorName?.trim() || t("survey.unknownPerson"),
                time: revision.validFrom ? formatDateTime(revision.validFrom) : "",
              })}
            </p>
            <p className="mt-0.5 text-slate-700">
              {revision.startAt ? formatDateTime(revision.startAt) : ""}
              {" · "}
              {t("survey.minutes", { minutes: revision.durationMinutes ?? 0 })}
            </p>
            <p className="text-slate-700">
              <SurveyPlace location={revision.meetingLocation} />
            </p>
            {revision.reason?.trim() && (
              <p className="whitespace-pre-wrap break-words text-slate-700">
                <span className="text-slate-500">{t("survey.revisions.reason")}: </span>
                {revision.reason}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
