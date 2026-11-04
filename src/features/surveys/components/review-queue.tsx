"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { paginationRange } from "@/components/ui/pagination-range";
import { useSession } from "@/features/auth/client";
import { formatDateTime } from "@/lib/format/vietnam-time";

import { reviewHref, reviewReasonKey, reviewRows } from "../lib/review-queue";
import {
  serializeSurveyListState,
  SURVEY_PAGE_SIZE,
  SURVEYS_PATH,
  type SurveyListState,
  toReviewQueueQuery,
} from "../lib/survey-list-url-state";
import { type SurveyUiError, toSurveyUiError } from "../lib/survey-ui-error";
import { getReviewQueue } from "../services/checklists-api";
import type { ChecklistReviewQueue } from "../types";

import { ListSkeleton } from "./list-skeleton";

const LINK =
  "inline-flex min-h-10 items-center font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

type Loaded = {
  userId: string;
  key: string;
  outcome: { kind: "page"; page: ChecklistReviewQueue } | { kind: "error"; error: SurveyUiError };
};

const hrefOf = (state: SurveyListState): string => `${SURVEYS_PATH}?${serializeSurveyListState(state)}`;

function Rows({ page, state }: { page: ChecklistReviewQueue; state: SurveyListState }) {
  const t = useTranslations("Surveys");
  const rows = reviewRows(page);
  const total = page.totalElements ?? 0;
  const range = paginationRange(state.page, SURVEY_PAGE_SIZE, total);

  if (range.outOfRange) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-slate-700">{t("pastEnd")}</p>
        <Link href={hrefOf({ ...state, page: 1 })} prefetch={false} className={LINK}>
          {t("firstPage")}
        </Link>
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-700 shadow-sm">{t("reviews.empty")}</p>;
  }
  return (
    <div className="space-y-4">
      <p aria-live="polite" className="text-sm text-slate-600">
        {t("reviews.total", { count: total })}
      </p>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.checklistId}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="break-words font-semibold text-slate-900">{row.leadCode}</p>
              <p className="text-slate-700">{t("reviews.checklist", { no: row.checklistNo ?? "" })}</p>
              <p className="break-words text-slate-600">
                {t("reviews.submitted", {
                  name: row.submittedByName?.trim() || t("reviews.unknownPerson"),
                  when: row.submittedAt ? formatDateTime(row.submittedAt) : "",
                })}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-1 md:items-end md:text-right">
              {row.canReview ? (
                <Badge tone="success">{t("reviews.canReview")}</Badge>
              ) : (
                <p className="break-words text-slate-700">{t(reviewReasonKey(row.reason))}</p>
              )}
              <Link href={reviewHref(row)} prefetch={false} className={LINK}>
                {t(row.canReview ? "reviews.open" : "reviews.view", { no: row.checklistNo ?? "" })}
              </Link>
            </div>
          </li>
        ))}
      </ul>
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
 * The "Reviews" tab of `/workspace/surveys` (survey-checklist submission spec 6.2, A-9): the submitted revisions of the
 * leads the viewer can see, oldest first, each with who submitted it and whether this viewer can review it or why not.
 * One read per user and URL: the queue has no read budget, so it is never polled (handoff 6).
 */
export function ReviewQueue({ state }: { state: SurveyListState }) {
  const t = useTranslations("Surveys");
  const { user } = useSession();
  const userId = user?.userId ?? null;
  const key = serializeSurveyListState(state);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloads, setReloads] = useState(0);
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Next keeps this route hidden (Activity) and shows it again on Back: forget the rows until the new read answers.
  useLayoutEffect(() => () => setLoaded(null), []);

  useEffect(() => {
    if (userId === null) return;
    let cancelled = false;
    const startedFor = userId;
    void getReviewQueue(toReviewQueueQuery(state)).then((result) => {
      if (cancelled || userIdRef.current !== startedFor) return;
      const error = toSurveyUiError(result);
      setLoaded({
        userId: startedFor,
        key,
        outcome:
          error === null && result.ok ? { kind: "page", page: result.data ?? {} } : { kind: "error", error: error ?? { kind: "retry" } },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, key, state, reloads]);

  const current = loaded !== null && loaded.userId === userId && loaded.key === key ? loaded : null;
  if (current === null) return <ListSkeleton />;
  if (current.outcome.kind === "page") return <Rows page={current.outcome.page} state={state} />;
  const { error } = current.outcome;
  if (error.kind === "signed-out" || error.kind === "unavailable") return null;
  return (
    <div className="space-y-3">
      <Alert tone="error">
        <p>{error.kind === "forbidden" ? t("errors.forbidden") : t("errors.loadFailed")}</p>
        {error.correlationId !== undefined && <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: error.correlationId })}</p>}
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
  );
}
