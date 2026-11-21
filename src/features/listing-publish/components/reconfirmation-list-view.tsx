"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/features/auth/client";

import { reconfirmationListModel } from "../lib/reconfirmation-model";
import { getListingReconfirmations } from "../services/freshness-api";
import type { ListingReconfirmations } from "../types";

const LINK_CLASS =
  "break-words text-sm font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/**
 * "Listings to reconfirm" (listing-publish US-6 AC-3, BR-10, spec section 6, E06S3-D13): the listings in the viewer's
 * scope whose reconfirmation is due, oldest confirmation first, each with a link to its page, its state, the three dates
 * of its latest valid confirmation, "Expired" after the last valid day, and a line when its latest contact is not a
 * valid confirmation. At most 50 rows; the server says when more may need it. It reads on mount and on "Try again";
 * a role the list does not admit reads its own sentence.
 */
export function ReconfirmationListView() {
  const t = useTranslations("ListingPublish");
  const [read, setRead] = useState<ApiResult<ListingReconfirmations> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let dropped = false;
    void getListingReconfirmations().then((result) => {
      if (!dropped) setRead(result);
    });
    return () => {
      dropped = true;
    };
  }, [attempt]);

  // Next keeps this route hidden (Activity): nothing of the list stays in it, and the next read starts as the first.
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

  const model = read === null ? null : reconfirmationListModel(read);
  if (model?.kind === "hidden") return null;

  let body;
  if (model === null) {
    body = (
      <p role="status" className="text-sm text-slate-500">
        {t("reconfirmations.loading")}
      </p>
    );
  } else if (model.kind === "error") {
    body = (
      <div className="space-y-3">
        <Alert tone="error">
          <p>{t("reconfirmations.loadFailed")}</p>
        </Alert>
        <Button variant="secondary" onClick={retry}>
          {t("reconfirmations.retry")}
        </Button>
      </div>
    );
  } else if (model.kind === "forbidden") {
    body = (
      <Alert tone="info">
        <p>{t("reconfirmations.forbidden")}</p>
      </Alert>
    );
  } else if (model.kind === "empty") {
    body = <p className="text-sm text-slate-700">{t("reconfirmations.empty")}</p>;
  } else {
    body = (
      <div className="space-y-3">
        <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          {model.rows.map((row) => (
            <li key={row.listingId} className="space-y-1.5 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link href={row.href} prefetch={false} className={LINK_CLASS}>
                  {row.code}
                </Link>
                <Badge>{t(row.stateKey)}</Badge>
                {row.deadlinePassed && <Badge tone="danger">{t("reconfirmations.expired")}</Badge>}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                <span>{t("reconfirmations.confirmed", { date: row.confirmedOn })}</span>
                <span>{t("reconfirmations.reconfirmFrom", { date: row.reconfirmFrom })}</span>
                <span>{t("reconfirmations.validThrough", { date: row.validThrough })}</span>
              </div>
              {!row.latestRecordValid && <p className="text-sm text-slate-700">{t("reconfirmations.notValid")}</p>}
            </li>
          ))}
        </ol>
        {model.hasMore && <p className="text-sm text-slate-500">{t("reconfirmations.hasMore")}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">{t("reconfirmations.title")}</h1>
      {body}
    </div>
  );
}
