"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useDraft } from "../lib/drafts";
import { formatDateTime } from "../lib/format";
import type { CommandMessage } from "../lib/command-flow";
import { HISTORY_ACTOR_KEY, historyActor } from "../lib/history-actor";
import { entryDraftOpen, entryTargets } from "../lib/history-entry";
import { historyActivityText } from "../lib/history-activity-text";
import { collapseChecklistSaves, collapsedSavesText, type HistoryRow as HistoryRowModel } from "../lib/history-collapse";
import { historyStatus } from "../lib/history-status";
import { isClosedLeadStatus, type LeadActivity } from "../types";

import { CommandMessageView } from "./command-message";
import { HISTORY_CELL, HISTORY_ROW } from "./history-cells";
import { HistoryEntryForm } from "./history-entry-form";
import { useLeadDetail } from "./lead-detail-context";
import { LeadStatusBadge } from "./lead-status-badge";

const HEAD = "px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500";
/** The small round "+" in the primary (brand gradient) style of Save (owner 2026-10-23). */
const ADD =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-lg font-semibold leading-none text-white shadow-md shadow-orange-700/25 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/** One earlier entry: read-only, the history cannot be edited (D-4). */
function HistoryRow({ activity, no, withAction }: { activity: LeadActivity; no: number; withAction: boolean }) {
  const t = useTranslations("OwnerLeads");
  const actor = historyActor(activity);
  const pic = actor.kind === "name" ? actor.name : t(HISTORY_ACTOR_KEY[actor.kind]);
  const when = activity.occurredAt === undefined ? "" : formatDateTime(activity.occurredAt);
  const status = historyStatus(activity);
  const label = (column: "no" | "updated" | "activity" | "pic" | "status") => t(`history.columns.${column}`);
  return (
    <tr role="row" className={HISTORY_ROW}>
      <td role="cell" data-label={label("no")} className={`${HISTORY_CELL} text-slate-500`}>
        {no}
      </td>
      <td role="cell" data-label={label("updated")} className={`${HISTORY_CELL} whitespace-nowrap`}>
        {when}
      </td>
      <td role="cell" data-label={label("activity")} className={`${HISTORY_CELL} whitespace-pre-wrap break-words`}>
        <span className="min-w-0">{historyActivityText(activity, t)}</span>
      </td>
      <td role="cell" data-label={label("pic")} className={HISTORY_CELL}>
        {pic}
      </td>
      <td role="cell" data-label={label("status")} className={HISTORY_CELL}>
        {status === undefined ? (
          <span className="text-slate-500">{t("history.noStatus")}</span>
        ) : (
          <LeadStatusBadge status={status} />
        )}
      </td>
      {/* Read only: nothing to do here; the empty cell is left out of the card below `xl`. */}
      {withAction && <td role="cell" className={`${HISTORY_CELL} max-xl:hidden`} />}
    </tr>
  );
}

/**
 * Consecutive checklist saves of one actor on one checklist as one line (survey-checklist A-21): "Checklist #m: k
 * saves by <name> (HH:mm–HH:mm)"; expanding it lists every save as its own row.
 */
function SavesRow({ row, withAction }: { row: Extract<HistoryRowModel, { kind: "saves" }>; withAction: boolean }) {
  const t = useTranslations("OwnerLeads");
  const [open, setOpen] = useState(false);
  const label = (column: "no" | "updated" | "activity" | "pic" | "status") => t(`history.columns.${column}`);
  const lastNo = row.firstNo + row.count - 1;
  return (
    <>
      <tr role="row" className={HISTORY_ROW}>
        <td role="cell" data-label={label("no")} className={`${HISTORY_CELL} text-slate-500`}>
          {row.firstNo}–{lastNo}
        </td>
        <td role="cell" data-label={label("updated")} className={`${HISTORY_CELL} whitespace-nowrap`}>
          {row.lastAt === "" ? "" : formatDateTime(row.lastAt)}
        </td>
        <td role="cell" data-label={label("activity")} className={`${HISTORY_CELL} break-words`}>
          <span className="min-w-0">
            {collapsedSavesText(row, t)}{" "}
            <button
              type="button"
              className="whitespace-nowrap text-sm font-medium text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? t("history.hideSaves") : t("history.showSaves", { count: row.count })}
            </button>
          </span>
        </td>
        <td role="cell" data-label={label("pic")} className={HISTORY_CELL}>
          {row.actorName ?? t("history.actorUnknown")}
        </td>
        <td role="cell" data-label={label("status")} className={HISTORY_CELL}>
          <span className="text-slate-500">{t("history.noStatus")}</span>
        </td>
        {withAction && <td role="cell" className={`${HISTORY_CELL} max-xl:hidden`} />}
      </tr>
      {open &&
        row.entries.map((entry, index) => (
          <HistoryRow
            key={`${entry.occurredAt ?? ""}-${index}`}
            activity={entry}
            no={row.firstNo + index}
            withAction={withAction}
          />
        ))}
    </>
  );
}

/**
 * The history of the lead as one table, oldest first as the API sends it (US-4 AC-5, owner 2026-10-23, D-4):
 * `# | UPDATED | ACTIVITY | PIC | STATUS | ACTION`. The "+" opens one new row at the end (`HistoryEntryForm`); it is
 * there on an open lead only. Text typed for a lead that closed meanwhile stays readable and copyable (W11-36) until
 * the user drops it.
 */
export function LeadHistory({ activities }: { activities: readonly LeadActivity[] }) {
  const t = useTranslations("OwnerLeads");
  const { userId, leadId, lead, busy } = useLeadDetail();
  const [kept, , clearKept] = useDraft({ userId, leadId, form: "activity" });
  const [keptStatus] = useDraft({ userId, leadId, form: "entryStatus" });
  // A draft from before (`unavailable`, a reload, Back/Forward) opens the row again.
  const [open, setOpen] = useState(() => entryDraftOpen({ activity: kept, status: keptStatus }));
  /** The last message of the row; kept here so it stays when the row closes (M-3). */
  const [message, setMessage] = useState<CommandMessage | null>(null);
  const [saved, setSaved] = useState(false);
  /** The last note was refused because the lead closed meanwhile (409), with its support code. */
  const [refused, setRefused] = useState<{ correlationId?: string } | null>(null);

  const rows = useMemo(() => collapseChecklistSaves(activities), [activities]);
  const closed = isClosedLeadStatus(lead.status);
  const canAdd = entryTargets(lead.status).length > 0;
  const rowOpen = canAdd && open;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{t("history.title")}</h2>
        {canAdd && (
          <button
            type="button"
            className={`${ADD} disabled:cursor-not-allowed disabled:opacity-60`}
            // Not while a command is on its way: hiding the row would lose its answer (M-1).
            disabled={busy}
            aria-expanded={rowOpen}
            aria-label={rowOpen ? t("history.hideEntry") : t("history.add")}
            title={rowOpen ? t("history.hideEntry") : t("history.add")}
            onClick={() => {
              setSaved(false);
              setMessage(null);
              setOpen((value) => !value);
            }}
          >
            <span aria-hidden>{rowOpen ? "−" : "+"}</span>
          </button>
        )}
      </div>

      {saved && !rowOpen && (
        <div className="mt-3" aria-live="polite">
          <Alert tone="success">{t("history.saved")}</Alert>
        </div>
      )}

      <div className="mt-3">
        {/* Explicit roles: the card layout below `xl` (display block) would drop the table semantics in some engines. */}
        <table role="table" className="w-full text-left text-sm max-xl:block xl:table-fixed">
          <caption className="sr-only">{t("history.caption")}</caption>
          {/* From `xl` the card is at least 944px wide: ACTIVITY keeps about 260px next to these columns. */}
          <colgroup>
            <col className="w-10" />
            <col className="w-36" />
            <col />
            <col className="w-36" />
            <col className="w-56" />
            {canAdd && <col className="w-32" />}
          </colgroup>
          <thead role="rowgroup" className="max-xl:hidden">
            <tr role="row" className="border-b border-slate-200">
              <th role="columnheader" scope="col" className={HEAD}>{t("history.columns.no")}</th>
              <th role="columnheader" scope="col" className={HEAD}>{t("history.columns.updated")}</th>
              <th role="columnheader" scope="col" className={HEAD}>{t("history.columns.activity")}</th>
              <th role="columnheader" scope="col" className={HEAD}>{t("history.columns.pic")}</th>
              <th role="columnheader" scope="col" className={HEAD}>{t("history.columns.status")}</th>
              {/* No ACTION column where nothing can be added (a closed lead). */}
              {canAdd && <th role="columnheader" scope="col" className={HEAD}>{t("history.columns.action")}</th>}
            </tr>
          </thead>
          <tbody role="rowgroup" className="max-xl:block">
            {activities.length === 0 && !rowOpen && (
              <tr role="row" className="max-xl:block">
                <td role="cell" colSpan={canAdd ? 6 : 5} className="px-3 py-3 text-slate-600 max-xl:block max-xl:px-0">
                  {t("history.empty")}
                </td>
              </tr>
            )}
            {rows.map((row) =>
              row.kind === "saves" ? (
                <SavesRow key={`saves-${row.firstNo}`} row={row} withAction={canAdd} />
              ) : (
                <HistoryRow
                  key={`${row.entry.occurredAt ?? ""}-${row.entry.type ?? ""}-${row.no}`}
                  activity={row.entry}
                  no={row.no}
                  withAction={canAdd}
                />
              ),
            )}
            {rowOpen && (
              <HistoryEntryForm
                no={activities.length + 1}
                message={message}
                onMessage={setMessage}
                onSaved={() => {
                  setRefused(null);
                  setOpen(false);
                  setSaved(true);
                }}
                onClosedRefused={(correlationId) =>
                  setRefused(correlationId === undefined ? {} : { correlationId })
                }
              />
            )}
          </tbody>
        </table>
      </div>

      {message !== null && (
        <div className="mt-3" aria-live="polite">
          <CommandMessageView message={message} />
        </div>
      )}

      {/* The one rule of the history, in dark yellow (owner 2026-10-23, D-9). */}
      <p className="mt-3 text-xs text-amber-700">{t("history.noEditRule")}</p>

      {closed && kept !== "" && (
        <div className="mt-4 space-y-3">
          {refused !== null ? (
            <Alert tone="info">
              <p>{t("history.closedKeepText")}</p>
              {refused.correlationId !== undefined && (
                <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: refused.correlationId })}</p>
              )}
            </Alert>
          ) : (
            <p className="text-sm text-slate-600">{t("history.keptDraft")}</p>
          )}
          <Textarea
            readOnly
            rows={3}
            value={kept}
            aria-label={t("history.activityLabel")}
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            variant="secondary"
            onClick={() => {
              clearKept();
              setRefused(null);
            }}
          >
            {t("history.discardDraft")}
          </Button>
        </div>
      )}
    </section>
  );
}
