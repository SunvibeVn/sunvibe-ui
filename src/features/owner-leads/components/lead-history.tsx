"use client";

import { useTranslations } from "next-intl";

import { formatDateTime } from "../lib/format";
import { HISTORY_ACTOR_KEY, historyActor } from "../lib/history-actor";
import { activityLabelKey, statusLabelKey } from "../lib/labels";
import type { LeadActivity } from "../types";

import { DetailSection } from "./detail-layout";

const UNKNOWN = Symbol("unknown-assignee");

/** One side of an assignee change: the name, UNKNOWN for an id without a name, undefined for nobody. */
function assigneeSide(id: string | undefined, name: string | null | undefined): string | typeof UNKNOWN | undefined {
  if (name?.trim()) return name;
  return id ? UNKNOWN : undefined;
}

function HistoryEntry({ activity }: { activity: LeadActivity }) {
  const t = useTranslations("OwnerLeads");
  const actor = historyActor(activity);
  const actorText = actor.kind === "name" ? actor.name : t(HISTORY_ACTOR_KEY[actor.kind]);

  const when = activity.occurredAt === undefined ? "" : formatDateTime(activity.occurredAt);
  const from = assigneeSide(activity.fromAssigneeId, activity.fromAssigneeName);
  const to = assigneeSide(activity.toAssigneeId, activity.toAssigneeName);
  const side = (value: string | typeof UNKNOWN) => (value === UNKNOWN ? t("history.actorUnknown") : value);

  const statusLine =
    activity.toStatus === undefined
      ? null
      : activity.fromStatus === undefined
        ? t("history.statusTo", { to: t(statusLabelKey(activity.toStatus)) })
        : t("history.statusChange", {
            from: t(statusLabelKey(activity.fromStatus)),
            to: t(statusLabelKey(activity.toStatus)),
          });
  const assigneeLine =
    to === undefined
      ? null
      : from === undefined
        ? t("history.assigneeTo", { to: side(to) })
        : t("history.assigneeChange", { from: side(from), to: side(to) });
  const nextActionTime = activity.nextActionAt === undefined ? "" : formatDateTime(activity.nextActionAt);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
        <span className="font-semibold text-slate-900">{t(activityLabelKey(activity.type))}</span>
        <span className="text-slate-600">{actorText}</span>
        {when !== "" && <span className="text-slate-500">{when}</span>}
      </div>
      {statusLine !== null && <p className="mt-0.5 text-sm text-slate-700">{statusLine}</p>}
      {assigneeLine !== null && <p className="mt-0.5 text-sm text-slate-700">{assigneeLine}</p>}
      {activity.note?.trim() && (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{activity.note}</p>
      )}
      {nextActionTime !== "" && (
        <p className="mt-0.5 text-sm text-slate-700">{t("history.nextAction", { time: nextActionTime })}</p>
      )}
    </li>
  );
}

/** History of the lead, oldest first as the API sends it (US-4 AC-5, W11-39). */
export function LeadHistory({ activities }: { activities: readonly LeadActivity[] }) {
  const t = useTranslations("OwnerLeads.history");
  return (
    <DetailSection title={t("title")}>
      {activities.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{t("empty")}</p>
      ) : (
        <ol className="mt-1 divide-y divide-slate-100">
          {activities.map((activity, index) => (
            <HistoryEntry key={`${activity.occurredAt ?? ""}-${activity.type ?? ""}-${index}`} activity={activity} />
          ))}
        </ol>
      )}
    </DetailSection>
  );
}
