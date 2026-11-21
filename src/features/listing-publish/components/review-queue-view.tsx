"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/features/auth/client";

import { reviewQueueModel } from "../lib/review-queue-model";
import { phraseText } from "../lib/revision-text";
import { getListingReviewQueue } from "../services/review-api";
import type { ListingReviewQueue } from "../types";

/** An instant on the staff page, as the listing page formats its times (the workspace provider sets the zone). */
const TIME_FORMAT = { dateStyle: "medium", timeStyle: "short" } as const;

const LINK_CLASS =
  "inline-flex text-sm font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

const CELL_CLASS = "px-3 py-2 align-top";

/**
 * "Listing reviews" (listing-publish US-4 AC-1, spec section 6, E06S4-D10, D17): the Pending review revisions, oldest
 * submission first, each with its listing code, revision, submission time, title and unit, and "Review" where the
 * viewer may review it, else the reasons why not. At most 50 rows; the server says when more are waiting. The title is
 * the Sale's content, shown as text only. It reads on mount and on "Try again"; a role the queue does not admit reads
 * its own sentence.
 */
export function ReviewQueueView() {
  const t = useTranslations("ListingPublish");
  const format = useFormatter();
  const [read, setRead] = useState<ApiResult<ListingReviewQueue> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let dropped = false;
    void getListingReviewQueue().then((result) => {
      if (!dropped) setRead(result);
    });
    return () => {
      dropped = true;
    };
  }, [attempt]);

  // Next keeps this route hidden (Activity): nothing of the queue stays in it, and the next read starts as the first.
  useLayoutEffect(
    () => () => {
      setRead(null);
    },
    [],
  );

  const retry = () => {
    setRead(null);
    setAttempt((count) => count + 1);
  };

  const model = read === null ? null : reviewQueueModel(read);
  if (model?.kind === "hidden") return null;

  let body;
  if (model === null) {
    body = (
      <p role="status" className="text-sm text-slate-500">
        {t("reviews.loading")}
      </p>
    );
  } else if (model.kind === "error") {
    body = (
      <div className="space-y-3">
        <Alert tone="error">
          <p>{t("reviews.loadFailed")}</p>
        </Alert>
        <Button variant="secondary" onClick={retry}>
          {t("reviews.retry")}
        </Button>
      </div>
    );
  } else if (model.kind === "forbidden") {
    body = (
      <Alert tone="info">
        <p>{t("reviews.forbidden")}</p>
      </Alert>
    );
  } else if (model.kind === "empty") {
    body = <p className="text-sm text-slate-700">{t("reviews.empty")}</p>;
  } else {
    body = (
      <div className="space-y-3">
        {model.rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className={CELL_CLASS}>
                    {t("reviews.columns.code")}
                  </th>
                  <th scope="col" className={CELL_CLASS}>
                    {t("reviews.columns.revision")}
                  </th>
                  <th scope="col" className={CELL_CLASS}>
                    {t("reviews.columns.submitted")}
                  </th>
                  <th scope="col" className={CELL_CLASS}>
                    {t("reviews.columns.title")}
                  </th>
                  <th scope="col" className={CELL_CLASS}>
                    {t("reviews.columns.unit")}
                  </th>
                  <th scope="col" className={CELL_CLASS}>
                    {t("reviews.columns.review")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {model.rows.map((row) => (
                  <tr key={`${row.listingId}:${row.revisionNo}`}>
                    <th scope="row" className={`${CELL_CLASS} whitespace-nowrap font-semibold text-slate-900`}>
                      {row.code}
                    </th>
                    <td className={CELL_CLASS}>{row.revisionNo}</td>
                    <td className={`${CELL_CLASS} whitespace-nowrap`}>{format.dateTime(new Date(row.submittedAt), TIME_FORMAT)}</td>
                    <td className={`${CELL_CLASS} min-w-48 break-words`}>{row.title}</td>
                    <td className={`${CELL_CLASS} min-w-48`}>{row.unitLine.map((part) => phraseText(t, part)).join(" · ")}</td>
                    <td className={`${CELL_CLASS} min-w-48`}>
                      {row.reviewHref !== null ? (
                        <Link href={row.reviewHref} prefetch={false} className={LINK_CLASS}>
                          {t("reviews.reviewLink")}
                        </Link>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-slate-700">{t("reviews.notEligible")}</p>
                          <ul className="list-disc space-y-0.5 pl-5 text-slate-700">
                            {row.reasonKeys.map((key) => (
                              <li key={key}>{t(key)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {model.hasMore && <p className="text-sm text-slate-500">{t("reviews.hasMore")}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">{t("reviews.title")}</h1>
      {body}
    </div>
  );
}
