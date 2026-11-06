"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Suspense, useCallback, useMemo } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { paginationRange } from "@/components/ui/pagination-range";
import { Tabs } from "@/components/ui/tabs";
import { useSession } from "@/features/auth/client";
import { viewerOf } from "@/features/workspace";
import { type ListOutcome, useUrlList } from "@/lib/use-url-list";

import { groupSurveyRows } from "../lib/survey-groups";
import {
  parseSurveyListState,
  serializeSurveyListState,
  SURVEY_PAGE_SIZE,
  SURVEYS_PATH,
  type SurveyListState,
  toSurveyApiQuery,
  withReviewsTab,
  withSurveyFilter,
} from "../lib/survey-list-url-state";
import { type SurveyUiError, toSurveyUiError } from "../lib/survey-ui-error";
import { listSurveys } from "../services/surveys-api";
import type { SurveyListItem, SurveyPage } from "../types";

import { ListSkeleton } from "./list-skeleton";
import { ReviewQueue } from "./review-queue";
import { SurveyCards } from "./survey-cards";
import { SurveyFilters } from "./survey-filters";
import { SurveyTable } from "./survey-table";

const hrefOf = (state: SurveyListState): string => `${SURVEYS_PATH}?${serializeSurveyListState(state)}`;

/** The Reviews tab reads the review queue instead (`ReviewQueue`). */
const isReviewsTab = (state: SurveyListState): boolean => state.tab === "reviews";

async function loadSurveys(state: SurveyListState): Promise<ListOutcome<NonNullable<SurveyPage>, SurveyUiError>> {
  const result = await listSurveys(toSurveyApiQuery(state));
  const error = toSurveyUiError(result);
  return error === null && result.ok ? { kind: "page", page: result.data ?? {} } : { kind: "error", error: error ?? { kind: "retry" } };
}

function SurveyListContent() {
  const t = useTranslations("Surveys");
  const { user } = useSession();
  const userId = user?.userId ?? null;
  // Key on the role values: the session store replaces `roles` on every token refresh.
  const rolesKey = (user?.roles ?? []).join(",");
  const viewer = useMemo(() => viewerOf(rolesKey === "" ? [] : rolesKey.split(",")), [rolesKey]);
  // The URL is read for THIS viewer, so a SALE never sends `scope=all` (spec 6.5).
  const parse = useCallback((params: URLSearchParams) => parseSurveyListState(params, viewer), [viewer]);
  const { state, normalized, page, status, retry, setFilter } = useUrlList({
    path: SURVEYS_PATH,
    userId,
    parse,
    serialize: serializeSurveyListState,
    withFilter: withSurveyFilter,
    load: loadSurveys,
    skips: isReviewsTab,
    // An appointment that moved to someone else meanwhile does not show again on Back while the new read runs.
    forgetWhenHidden: true,
  });
  const reviews = isReviewsTab(state);

  if (userId === null) return null;

  const tabs = [
    ...viewer.tabs.map((tab) => ({
      href: hrefOf(withSurveyFilter(state, { scope: tab })),
      label: t(`tabs.${tab}`),
      current: !reviews && state.scope === tab,
    })),
    { href: hrefOf(withReviewsTab(state)), label: t("tabs.reviews"), current: reviews },
  ];
  const total = page?.totalElements ?? 0;
  const totalLine = status.kind === "ready" && total > 0 ? t("total", { count: total }) : "";

  return (
    <div className="space-y-4">
      {/* No visible title, as the lead list; the page keeps its one h1 for screen readers. */}
      <h1 className="sr-only">{t("title")}</h1>
      <Tabs items={tabs} label={t("tabs.label")} />
      {!reviews && (
        <>
          <SurveyFilters state={state} onSurveyor={(surveyor) => setFilter({ surveyor })} />
          <p aria-live="polite" className={totalLine === "" ? "sr-only" : "text-sm text-slate-600"}>
            {totalLine}
          </p>
        </>
      )}
      <div>
        {reviews && normalized ? (
          <ReviewQueue state={state} />
        ) : status.kind === "loading" ? (
          <ListSkeleton />
        ) : status.kind === "error" ? (
          status.error.kind === "signed-out" || status.error.kind === "unavailable" ? null : (
            <div className="space-y-3">
              <Alert tone="error">
                <p>{status.error.kind === "forbidden" ? t("errors.forbidden") : t("errors.loadFailed")}</p>
                {status.error.correlationId !== undefined && (
                  <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: status.error.correlationId })}</p>
                )}
              </Alert>
              <Button variant="secondary" onClick={retry}>
                {t("errors.retry")}
              </Button>
            </div>
          )
        ) : (
          <SurveyResults page={status.page} state={state} />
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
 * tabs of the lead list, the Surveyor filter on "All Surveys", and the Reviews tab (survey-checklist submission A-9). Read
 * through `useUrlList`, which needs the Suspense boundary.
 */
export function SurveyListView() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SurveyListContent />
    </Suspense>
  );
}
