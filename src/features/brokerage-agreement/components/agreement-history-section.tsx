"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import {
  HISTORY_PAGE_SIZE,
  type HistoryEntryRow,
  type HistoryPageOutcome,
  historyPageOutcome,
} from "../lib/agreement-history-model";
import { getAgreementHistory } from "../services/agreement-api";

/**
 * The entries read so far, newest first, the server's count of every entry, how many pages are read, and the read's
 * state: a read running, the page whose read failed, or a session state (the session screens answer).
 */
type HistoryState = {
  rows: HistoryEntryRow[];
  total: number;
  pages: number;
  read: { kind: "running" } | { kind: "idle" } | { kind: "failed"; page: number } | { kind: "session" };
};

const FIRST_READ: HistoryState = { rows: [], total: 0, pages: 0, read: { kind: "running" } };

/** The state after the answer for `page`: page 0 replaces the entries, a later page is appended. */
function afterAnswer(current: HistoryState, page: number, outcome: HistoryPageOutcome): HistoryState {
  switch (outcome.kind) {
    case "page":
      return {
        rows: page === 0 ? outcome.rows : [...current.rows, ...outcome.rows],
        total: outcome.total,
        pages: page + 1,
        read: { kind: "idle" },
      };
    case "session":
      return { ...current, read: { kind: "session" } };
    case "failed":
      return { ...current, read: { kind: "failed", page } };
  }
}

/**
 * The entries of an open history (brokerage-agreement E05-S7, US-4 AC-4, S7-D7, E05S7-P8). Mounted on each opening and
 * again for each new data version of the page, so it starts at page 0 every time. Each read is numbered: an answer that
 * arrives after a later read started or after the unmount (the hide, a new data version, the reread of the page) is
 * dropped, never shown or appended. "Show older entries" is disabled while a read runs, so a double click asks once.
 */
function HistoryEntries({ id, agreementId }: { id: string; agreementId: string }) {
  const t = useTranslations("BrokerageAgreement");
  const [history, setHistory] = useState<HistoryState>(FIRST_READ);
  const sequence = useRef(0);

  const read = useCallback(
    (page: number) => {
      const number = ++sequence.current;
      void getAgreementHistory(agreementId, { page, size: HISTORY_PAGE_SIZE }).then((result) => {
        if (sequence.current !== number) return;
        const outcome = historyPageOutcome(result);
        setHistory((current) => afterAnswer(current, page, outcome));
      });
    },
    [agreementId],
  );

  useEffect(() => {
    const reads = sequence;
    read(0);
    return () => {
      // Gone: no answer of this section is shown any more.
      reads.current += 1;
    };
  }, [read]);

  const again = (page: number) => {
    if (history.read.kind === "running") return;
    setHistory((current) => ({ ...current, read: { kind: "running" } }));
    read(page);
  };

  if (history.read.kind === "session") return null;
  const running = history.read.kind === "running";
  const failed = history.read.kind === "failed" ? history.read : null;

  return (
    <div id={id} className="space-y-3">
      {history.rows.length > 0 && (
        <ol className="divide-y divide-slate-100">
          {history.rows.map((row, index) => (
            <li key={index} className="space-y-0.5 py-2 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-slate-900">{t(row.event)}</p>
              <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                <span>{row.time}</span>
                {row.versionNo !== null && <span>{t("history.version", { number: row.versionNo })}</span>}
                {row.actor !== null && (
                  <span className="break-words">{"name" in row.actor ? row.actor.name : t(row.actor.key)}</span>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
      {running && history.rows.length === 0 && (
        <p role="status" className="text-sm text-slate-500">
          {t("history.loading")}
        </p>
      )}
      {!running && failed === null && history.rows.length === 0 && (
        <p className="text-sm text-slate-700">{t("history.empty")}</p>
      )}
      {failed !== null && (
        <div className="space-y-2">
          <Alert tone="error">
            <p>{t("history.loadFailed")}</p>
          </Alert>
          <Button variant="secondary" className="px-4 py-2" onClick={() => again(failed.page)}>
            {t("history.retry")}
          </Button>
        </div>
      )}
      {failed === null && history.rows.length > 0 && history.rows.length < history.total && (
        <Button variant="secondary" className="px-4 py-2" pending={running} onClick={() => again(history.pages)}>
          {t("history.older")}
        </Button>
      )}
    </div>
  );
}

/**
 * "History" on the agreement page (brokerage-agreement E05-S7, US-4 AC-4, S7-D7, S7-D12): who did what and when, newest
 * first, without any reason (BR-17). Collapsed, it reads nothing. The page holds `open` (E05S7-P10), so the section
 * stays open across the reread that follows a command and reads its first page again; a new `dataVersion` while open
 * reads it again too. Staff names are shown as the server answers them, as text.
 */
export function AgreementHistorySection({
  agreementId,
  dataVersion,
  open,
  onToggle,
}: {
  agreementId: string;
  dataVersion: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("BrokerageAgreement");
  const titleId = useId();
  const entriesId = useId();

  return (
    <section aria-labelledby={titleId} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          {t("history.title")}
        </h2>
        <Button
          variant="secondary"
          className="px-4 py-2"
          aria-expanded={open}
          aria-controls={open ? entriesId : undefined}
          onClick={onToggle}
        >
          {open ? t("history.hide") : t("history.show")}
        </Button>
      </div>
      {open && <HistoryEntries key={`${agreementId}:${dataVersion ?? ""}`} id={entriesId} agreementId={agreementId} />}
    </section>
  );
}
