"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { paginationRange } from "@/components/ui/pagination-range";
import { Tabs } from "@/components/ui/tabs";
import { useSession } from "@/features/auth/client";
import { viewerOf } from "@/features/workspace";

import { groupSurveyRows } from "../lib/survey-groups";
import {
  parseSurveyListState,
  serializeSurveyListState,
  SURVEY_PAGE_SIZE,
  SURVEYS_PATH,
  type SurveyListState,
  toSurveyApiQuery,
  withSurveyFilter,
} from "../lib/survey-list-url-state";
import { type SurveyUiError, toSurveyUiError } from "../lib/survey-ui-error";
import { listSurveys } from "../services/surveys-api";
import type { SurveyListItem, SurveyPage } from "../types";

import { SurveyCards } from "./survey-cards";
import { SurveyFilters } from "./survey-filters";
import { SurveyTable } from "./survey-table";

type Loaded = {
  userId: string;
  key: string;
  outcome: { kind: "page"; page: NonNullable<SurveyPage> } | { kind: "error"; error: SurveyUiError };
};

const hrefOf = (state: SurveyListState): string => `${SURVEYS_PATH}?${serializeSurveyListState(state)}`;

function ListSkeleton() {
  const t = useTranslations("Surveys");
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <span className="sr-only">{t("loading")}</span>
      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden className="h-16 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      ))}
    </div>
  );
}

function SurveyListContent() {
  const t = useTranslations("Surveys");
  const { user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const userId = user?.userId ?? null;
  // Key on the role values: the session store replaces `roles` on every token refresh.
  const rolesKey = (user?.roles ?? []).join(",");
  const viewer = useMemo(() => viewerOf(rolesKey === "" ? [] : rolesKey.split(",")), [rolesKey]);
  const query = searchParams.toString();
  // The only source of a call: the URL read for THIS viewer, so a SALE never sends `scope=all` (spec 6.5).
  const state = useMemo(() => parseSurveyListState(new URLSearchParams(query), viewer), [query, viewer]);
  const canonical = serializeSurveyListState(state);
  const normalized = query === canonical;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloads, setReloads] = useState(0);
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Next keeps this route hidden (Activity) and shows it again on Back: forget the rows, so an appointment that moved to
  // someone else meanwhile does not show again while the new read runs.
  useLayoutEffect(() => () => setLoaded(null), []);

  // 1. A URL that is not the normalized one is replaced first; nothing is requested for it.
  useEffect(() => {
    if (userId === null || normalized || pathname !== SURVEYS_PATH) return;
    router.replace(`${SURVEYS_PATH}?${canonical}`, { scroll: false });
  }, [userId, normalized, pathname, canonical, router]);

  // 2. One call per user and normalized URL; an answer for another URL or user is dropped.
  useEffect(() => {
    if (userId === null || !normalized || pathname !== SURVEYS_PATH) return;
    let cancelled = false;
    const startedFor = userId;
    void listSurveys(toSurveyApiQuery(state)).then((result) => {
      if (cancelled || userIdRef.current !== startedFor) return;
      const error = toSurveyUiError(result);
      setLoaded({
        userId: startedFor,
        key: canonical,
        outcome:
          error === null && result.ok
            ? { kind: "page", page: result.data ?? {} }
            : { kind: "error", error: error ?? { kind: "retry" } },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, normalized, pathname, canonical, state, reloads]);

  if (userId === null) return null;

  const current = loaded !== null && loaded.userId === userId && loaded.key === canonical ? loaded : null;
  const tabs = viewer.tabs.map((tab) => ({
    href: hrefOf(withSurveyFilter(state, { scope: tab })),
    label: t(`tabs.${tab}`),
    current: state.scope === tab,
  }));
  const total = current?.outcome.kind === "page" ? (current.outcome.page.totalElements ?? 0) : 0;
  const totalLine = normalized && current?.outcome.kind === "page" && total > 0 ? t("total", { count: total }) : "";

  return (
    <div className="space-y-4">
      {/* No visible title, as the lead list; the page keeps its one h1 for screen readers. */}
      <h1 className="sr-only">{t("title")}</h1>
      <Tabs items={tabs} label={t("tabs.label")} />
      <SurveyFilters
        state={state}
        onSurveyor={(surveyor) => router.replace(hrefOf(withSurveyFilter(state, { surveyor })), { scroll: false })}
      />
      <p aria-live="polite" className={totalLine === "" ? "sr-only" : "text-sm text-slate-600"}>
        {totalLine}
      </p>
      <div>
        {!normalized || current === null ? (
          <ListSkeleton />
        ) : current.outcome.kind === "error" ? (
          current.outcome.error.kind === "signed-out" || current.outcome.error.kind === "unavailable" ? null : (
            <div className="space-y-3">
              <Alert tone="error">
                <p>{current.outcome.error.kind === "forbidden" ? t("errors.forbidden") : t("errors.loadFailed")}</p>
                {current.outcome.error.correlationId !== undefined && (
                  <p className="mt-1 text-xs">
                    {t("errors.supportCode", { correlationId: current.outcome.error.correlationId })}
                  </p>
                )}
              </Alert>
              <Button
                variant="secondary"
                onClick={() => {
                  setLoaded(null);
                  setReloads((count) => count + 1);
                }}
              >
                {t("errors.retry")}
              </Button>
            </div>
          )
        ) : (
          <SurveyResults page={current.outcome.page} state={state} />
        )}
      </div>
    </div>
  );
}

function SurveyResults({ page, state }: { page: NonNullable<SurveyPage>; state: SurveyListState }) {
  const t = useTranslations("Surveys");
  const rows = (page.items ?? []).filter((item): item is NonNullable<SurveyListItem> => item !== null);
  const range = paginationRange(state.page, SURVEY_PAGE_SIZE, page.totalElements ?? 0);

  if (range.outOfRange) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-slate-700">{t("pastEnd")}</p>
        <Link
          href={hrefOf({ ...state, page: 1 })}
          prefetch={false}
          className="inline-flex min-h-10 items-center font-semibold text-violet-700 underline-offset-2 hover:underline"
        >
          {t("firstPage")}
        </Link>
      </div>
    );
  }

  if (rows.length === 0) {
    const empty = state.surveyor !== undefined ? "empty.filtered" : state.scope === "mine" ? "empty.mine" : "empty.all";
    return <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-700 shadow-sm">{t(empty)}</p>;
  }

  const sections = groupSurveyRows(rows);
  return (
    <div className="space-y-4">
      <SurveyTable sections={sections} />
      <SurveyCards sections={sections} />
      <Pagination
        page={state.page}
        totalPages={range.totalPages}
        hrefFor={(target) => hrefOf({ ...state, page: target })}
        label={t("pagination.label")}
        summary={t("pagination.pageOf", { page: state.page, total: range.totalPages })}
        previousLabel={t("pagination.previous")}
        nextLabel={t("pagination.next")}
      />
    </div>
  );
}

/**
 * The survey list `/workspace/surveys` (spec 6.5): SCHEDULED appointments in groups Overdue, Today, Upcoming, the
 * tabs of the lead list, the Surveyor filter on "All Surveys". Read in the browser only: the URL is normalized for the
 * viewer first, then one `GET` per user and URL. `useSearchParams` needs the Suspense boundary.
 */
export function SurveyListView() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SurveyListContent />
    </Suspense>
  );
}
