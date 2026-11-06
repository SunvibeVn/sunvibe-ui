"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { paginationRange } from "@/components/ui/pagination-range";
import { Tabs } from "@/components/ui/tabs";
import { ForbiddenNotice, useSession } from "@/features/auth/client";
import { type LeadSummary, LIST_PATH } from "@/features/lead-shared";
import { lastListUrl, listFlash, type ListFlashKind } from "@/features/lead-shared/client";
import { type ListOutcome, useUrlList } from "@/lib/use-url-list";

import { type LeadUiError, toLeadUiError } from "../lib/lead-ui-error";
import {
  LIST_PAGE_SIZE,
  type ListState,
  hasActiveFilter,
  parseListState,
  serializeListState,
  toApiQuery,
  withFilter,
} from "../lib/list-url-state";
import { type Viewer, viewerOf } from "../lib/viewer";
import { listLeads } from "../services/owner-leads-api";

import type { LeadPage } from "../types";
import { LeadCards } from "./lead-cards";
import { LeadFilters } from "./lead-filters";
import { LeadTable } from "./lead-table";
import { listHref } from "./list-href";

const NO_LEADS: readonly LeadSummary[] = [];

async function loadLeads(state: ListState): Promise<ListOutcome<LeadPage, LeadUiError>> {
  const result = await listLeads(toApiQuery(state));
  const error = toLeadUiError(result);
  return error === null && result.ok ? { kind: "page", page: result.data } : { kind: "error", error: error ?? { kind: "retry" } };
}

function ListSkeleton() {
  const t = useTranslations("OwnerLeads");
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <span className="sr-only">{t("list.loading")}</span>
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} aria-hidden className="h-16 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      ))}
    </div>
  );
}

function ListError({ error, onRetry }: { error: LeadUiError; onRetry: () => void }) {
  const t = useTranslations("OwnerLeads");
  if (error.kind === "forbidden") return <ForbiddenNotice />;
  return (
    <div className="space-y-3">
      <Alert tone="error">
        <p>{t("errors.loadFailed")}</p>
        {error.correlationId !== undefined && (
          <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: error.correlationId })}</p>
        )}
      </Alert>
      <Button variant="secondary" onClick={onRetry}>
        {t("errors.retry")}
      </Button>
    </div>
  );
}

function LeadListContent() {
  const t = useTranslations("OwnerLeads");
  const { user } = useSession();
  const pathname = usePathname();
  const userId = user?.userId ?? null;
  // The session store replaces `roles` (a new array) on every token refresh: key on the values, or each refresh
  // would rebuild the state and make a second list call.
  const rolesKey = (user?.roles ?? []).join(",");

  const viewer = useMemo(() => viewerOf(rolesKey === "" ? [] : rolesKey.split(",")), [rolesKey]);
  // The URL is read for THIS viewer (a SALE always lands on "mine", W11-23).
  const parse = useCallback((params: URLSearchParams) => parseListState(params, viewer), [viewer]);
  const { state, canonical, normalized, page, status, retry, setFilter } = useUrlList({
    path: LIST_PATH,
    userId,
    parse,
    serialize: serializeListState,
    withFilter,
    load: loadLeads,
  });

  const [notice, setNotice] = useState<ListFlashKind | null>(null);

  // The one-shot notice the detail left before sending the user here (C-37, e.g. "lead not found"). Taken once; it
  // runs again when the route is shown after being hidden (Activity), which is when a redirect from the detail lands.
  // Hiding the route drops the notice on screen, so it never comes back with the route (CR-5).
  useEffect(() => {
    if (userId === null) return;
    // `take` runs now (once, even with the dev double effect); the state is set a tick later, as the lint rule on
    // synchronous setState in effects requires. The dev double effect runs the cleanup before that tick, so the notice
    // taken by the first run still shows.
    void Promise.resolve(listFlash.take(userId)).then((flash) => {
      if (flash !== null) setNotice(flash);
    });
    return () => {
      setNotice(null);
    };
  }, [userId]);

  // The list URL this user sees now: the detail's "Back to leads" link returns to it (CR-10, memory only).
  useEffect(() => {
    if (userId === null || !normalized || pathname !== LIST_PATH) return;
    lastListUrl.set(userId, canonical === "" ? LIST_PATH : `${LIST_PATH}?${canonical}`);
  }, [userId, normalized, pathname, canonical]);

  if (userId === null) return null;

  const rows = page?.items ?? NO_LEADS;
  // The short status line read out by screen readers when a page of results arrives (CR-13).
  const totalLine = status.kind === "ready" && rows.length > 0 ? t("list.total", { count: status.page.totalElements ?? 0 }) : "";

  const tabs = viewer.tabs.map((tab) => ({
    href: listHref(state, { scope: tab }, viewer),
    label: t(`tabs.${tab}`),
    current: state.scope === tab,
  }));

  return (
    <div className="space-y-4">
      {/* No visible title (owner 2026-10-23); the page keeps its one h1 for screen readers. */}
      <h1 className="sr-only">{t("title")}</h1>
      {notice !== null && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <Alert tone="info">{t(`errors.${notice}`)}</Alert>
          </div>
          <Button variant="ghost" onClick={() => setNotice(null)}>
            {t("notice.dismiss")}
          </Button>
        </div>
      )}
      <Tabs items={tabs} label={t("tabs.label")} />
      <LeadFilters state={state} viewer={viewer} rows={rows} onFilter={setFilter} />
      <p aria-live="polite" className={totalLine === "" ? "sr-only" : "text-sm text-slate-600"}>
        {totalLine}
      </p>
      <div>
        {status.kind === "loading" ? (
          <ListSkeleton />
        ) : status.kind === "error" ? (
          status.error.kind === "signed-out" || status.error.kind === "unavailable" ? null : (
            <ListError error={status.error} onRetry={retry} />
          )
        ) : (
          <ListResults page={status.page} state={state} viewer={viewer} filtered={hasActiveFilter(state)} />
        )}
      </div>
    </div>
  );
}

type ListResultsProps = {
  page: LeadPage;
  state: ListState;
  viewer: Viewer;
  filtered: boolean;
};

function ListResults({ page, state, viewer, filtered }: ListResultsProps) {
  const t = useTranslations("OwnerLeads");
  const items = page.items ?? NO_LEADS;
  const range = paginationRange(state.page, LIST_PAGE_SIZE, page.totalElements ?? 0);

  if (range.outOfRange) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-slate-700">{t("empty.pastEnd")}</p>
        <Link
          href={listHref(state, {}, viewer, 1)}
          prefetch={false}
          className="inline-flex min-h-10 items-center font-semibold text-violet-700 underline-offset-2 hover:underline"
        >
          {t("empty.firstPage")}
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    // Unfiltered "All Leads" is its default, Unassigned only (C-44).
    const empty = filtered ? "empty.filtered" : state.scope === "mine" ? "empty.mine" : "empty.unassigned";
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-700 shadow-sm">{t(empty)}</p>
    );
  }

  return (
    <div className="space-y-4">
      <LeadTable leads={items} />
      <LeadCards leads={items} />
      <Pagination
        page={state.page}
        totalPages={range.totalPages}
        hrefFor={(target) => listHref(state, {}, viewer, target)}
        label={t("list.pagination.label")}
        summary={t("list.pagination.pageOf", { page: state.page, total: range.totalPages })}
        previousLabel={t("list.pagination.previous")}
        nextLabel={t("list.pagination.next")}
      />
    </div>
  );
}

/**
 * The staff lead list (spec 5.3), read through `useUrlList`, which needs the Suspense boundary.
 */
export function LeadListView() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <LeadListContent />
    </Suspense>
  );
}
