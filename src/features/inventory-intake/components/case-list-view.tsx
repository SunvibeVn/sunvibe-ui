"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RequireRole } from "@/features/auth/client";
import { formatDateTime } from "@/lib/format/vietnam-time";

import { caseListQuery, casePageCount } from "../lib/case-decision-form";
import { caseRoute } from "../lib/intake-routes";
import { MANAGER_ROLES } from "../lib/intake-viewer";
import { type CaseListQuery, listCases } from "../services/cases-api";
import { toIntakeUiError } from "../services/intake-api";
import type { InventoryCasePage } from "../types";

const STATUSES: readonly CaseListQuery["status"][] = ["OPEN", "DECIDED"];

type ListView = { kind: "ready"; page: InventoryCasePage } | { kind: "error"; correlationId?: string } | { kind: "gone" };

/** One answer, for one status and page. */
type ListRead = { key: string; view: ListView };

/** `/workspace/inventory-cases`: the cases this manager may read (spec 7.2). */
export function CaseListView() {
  return (
    <RequireRole anyOf={MANAGER_ROLES}>
      <CaseList />
    </RequireRole>
  );
}

function CaseList() {
  const t = useTranslations("InventoryIntake");
  const [status, setStatus] = useState<CaseListQuery["status"]>("OPEN");
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<ListRead | null>(null);
  const key = `${status}-${page}-${attempt}`;

  useEffect(() => {
    let dropped = false;
    void listCases(caseListQuery(status, page)).then((result) => {
      if (dropped) return;
      if (result.ok) {
        // The last case of the last page was decided: the list goes to the page that still has rows.
        if ((result.data.items ?? []).length === 0 && page > 0) setPage(Math.max(0, casePageCount(result.data) - 1));
        setRead({ key, view: { kind: "ready", page: result.data } });
        return;
      }
      const error = toIntakeUiError(result);
      if (error?.kind === "signed-out" || error?.kind === "unavailable") return;
      const gone = error?.kind === "not-found" || error?.kind === "forbidden";
      const view: ListView = gone
        ? { kind: "gone" }
        : error?.correlationId === undefined
          ? { kind: "error" }
          : { kind: "error", correlationId: error.correlationId };
      setRead({ key, view });
    });
    return () => {
      dropped = true;
    };
  }, [status, page, key]);

  // Next keeps this route hidden (Activity): the list does not stay in it.
  useLayoutEffect(() => () => setRead(null), []);

  const view = read?.key === key ? read.view : null;
  const pages = view?.kind === "ready" ? casePageCount(view.page) : 0;
  const items = view?.kind === "ready" ? (view.page.items ?? []) : [];
  const choose = (next: CaseListQuery["status"]) => {
    setStatus(next);
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-navy-950">{t("cases.title")}</h1>
      <div role="group" aria-label={t("cases.statusLabel")} className="flex gap-2">
        {STATUSES.map((value) => (
          <Button key={value} variant={status === value ? "primary" : "secondary"} aria-pressed={status === value} onClick={() => choose(value)}>
            {t(`cases.tabs.${value}`)}
          </Button>
        ))}
      </div>
      {view === null && (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("cases.loading")}</span>
          <div aria-hidden className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        </div>
      )}
      {view?.kind === "gone" && <Alert>{t("cases.unavailable")}</Alert>}
      {view?.kind === "error" && (
        <div className="space-y-3">
          <Alert tone="error">
            <p>{t("cases.loadFailed")}</p>
            {view.correlationId !== undefined && <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: view.correlationId })}</p>}
          </Alert>
          <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>
            {t("cases.retry")}
          </Button>
        </div>
      )}
      {view?.kind === "ready" && items.length === 0 && <p className="text-sm text-slate-600">{t("cases.empty")}</p>}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.caseId}>
              <Link
                href={caseRoute(item.caseId ?? "")}
                prefetch={false}
                className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-violet-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
              >
                <span className="block text-sm font-semibold text-slate-900">
                  {[item.leadCode, item.wardName].filter(Boolean).join(" · ")}
                </span>
                {item.createdAt && <span className="block text-xs text-slate-500">{t("cases.opened", { date: formatDateTime(item.createdAt) })}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center gap-3">
          <Button variant="secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
            {t("cases.previous")}
          </Button>
          <span className="text-sm text-slate-600">{t("cases.pageOf", { page: page + 1, total: pages })}</span>
          <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>
            {t("cases.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
