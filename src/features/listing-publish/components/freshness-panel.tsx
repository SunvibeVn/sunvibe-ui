"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/features/auth/client";

import { freshnessPanelModel } from "../lib/freshness-model";
import type { ListingChange } from "../lib/freshness-record-flow";
import { getListingFreshness } from "../services/freshness-api";
import type { ListingFreshness } from "../types";

import { FreshnessRecordForm } from "./freshness-record-form";

type FreshnessPanelProps = {
  listingId: string;
  /** The listing's data version the page read last, which a record sends back. */
  dataVersion: number;
  /** The assigned Sale of a listing that is not archived: a hint, the server decides every record. */
  viewerMayRecord: boolean;
  /** The agreement's page, where E05's termination "The unit is let" is recorded (E06S3-D11). */
  agreementHref: string;
  /** The page's listing re-read has not answered: "Save contact" waits for the new data version. */
  listingRereading: boolean;
  /** What a record or a read means for the listing; the page decides its re-read (E06S3-D12, P8). */
  onListingChanged: (change: ListingChange) => void;
};

const LINK_CLASS =
  "font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/**
 * "Freshness" on the listing page (listing-publish US-6 AC-1, AC-2, AC-6, spec section 6): the latest valid
 * confirmation with the day reconfirmation is due and the last valid day, their flags, and the latest contact with
 * its answers and its private note, shown as text only. A latest "No longer available" shows the prompt to record
 * E05's termination on the agreement. The assigned Sale records a contact inline; after a record the panel reads
 * again. It reads on mount, after a record and on "Try again"; a 404 shows nothing and asks the page to read the
 * listing again. Nothing here is public, and the panel repeats none of the revision panel's or the page's texts.
 */
export function FreshnessPanel({ listingId, dataVersion, viewerMayRecord, agreementHref, listingRereading, onListingChanged }: FreshnessPanelProps) {
  const t = useTranslations("ListingPublish");
  const headingId = useId();
  const [read, setRead] = useState<ApiResult<ListingFreshness> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [recording, setRecording] = useState(false);

  const listingGone = useEffectEvent(() => onListingChanged("gone"));

  useEffect(() => {
    let dropped = false;
    void getListingFreshness(listingId).then((result) => {
      if (dropped) return;
      setRead(result);
      // The one 404 of an unknown or out-of-scope listing: the page reads the listing again (E06S3-D12).
      if (!result.ok && result.kind === "http" && result.status === 404) listingGone();
    });
    return () => {
      dropped = true;
    };
  }, [listingId, attempt]);

  const retry = () => {
    setRead(null);
    setAttempt((count) => count + 1);
  };
  // A record answered: the form closes and the panel reads again, keeping what it shows until the answer.
  const recorded = () => {
    setRecording(false);
    setAttempt((count) => count + 1);
  };

  const model = read === null ? null : freshnessPanelModel(read);
  if (model?.kind === "hidden" || model?.kind === "not-found") return null;

  const record =
    viewerMayRecord &&
    (recording ? (
      <FreshnessRecordForm
        listingId={listingId}
        dataVersion={dataVersion}
        agreementHref={agreementHref}
        listingRereading={listingRereading}
        onDone={recorded}
        onCancel={() => setRecording(false)}
        onListingChanged={onListingChanged}
      />
    ) : (
      <Button className="px-4 py-2" onClick={() => setRecording(true)}>
        {t("freshness.record")}
      </Button>
    ));

  let body;
  if (model === null) {
    body = (
      <p role="status" className="text-sm text-slate-500">
        {t("freshness.loading")}
      </p>
    );
  } else if (model.kind === "error") {
    body = (
      <div className="space-y-2">
        <Alert tone="error">
          <p>{t("freshness.loadFailed")}</p>
        </Alert>
        <Button variant="secondary" className="px-4 py-2" onClick={retry}>
          {t("freshness.retry")}
        </Button>
      </div>
    );
  } else if (model.kind === "empty") {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-slate-700">{t("freshness.none")}</p>
        {record}
      </div>
    );
  } else {
    const { latest } = model;
    body = (
      <div className="space-y-3">
        <div className="space-y-1 text-sm text-slate-900">
          <p className="font-medium">
            {model.confirmedOn === null ? t("freshness.noValid") : t("freshness.lastValid", { date: model.confirmedOn })}
          </p>
          {model.reconfirmFrom !== null && (
            <p className="flex flex-wrap items-center gap-2">
              <span>{t("freshness.reconfirmFrom", { date: model.reconfirmFrom })}</span>
              {model.reconfirmationDue && <Badge tone="warning">{t("freshness.due")}</Badge>}
            </p>
          )}
          {model.validThrough !== null && (
            <p className="flex flex-wrap items-center gap-2">
              <span>{t("freshness.validThrough", { date: model.validThrough })}</span>
              {model.deadlinePassed && <Badge tone="danger">{t("freshness.expired")}</Badge>}
            </p>
          )}
        </div>
        <div className="space-y-1 text-sm text-slate-700">
          <p>{t("freshness.latest", { date: latest.date, channel: t(latest.channelKey), outcome: t(latest.outcomeKey) })}</p>
          {latest.answers !== null && (
            <>
              <p>{t("freshness.termsStillApply", { answer: t(latest.answers.termsStillApply ? "freshness.yes" : "freshness.no") })}</p>
              <p>{t("freshness.unitUnchanged", { answer: t(latest.answers.unitUnchanged ? "freshness.yes" : "freshness.no") })}</p>
            </>
          )}
          {!latest.valid && <p>{t("freshness.notValid")}</p>}
          {latest.note !== null && (
            <div>
              <p className="text-slate-500">{t("freshness.privateNote")}</p>
              <p className="whitespace-pre-line break-words text-slate-900">{latest.note}</p>
            </div>
          )}
        </div>
        {latest.prompt && (
          <p className="text-sm text-slate-700">
            {t("freshness.prompt")}{" "}
            <Link href={agreementHref} prefetch={false} className={LINK_CLASS}>
              {t("freshness.goToAgreement")}
            </Link>
          </p>
        )}
        {record}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id={headingId} className="text-base font-semibold text-slate-900">
        {t("freshness.heading")}
      </h2>
      {body}
    </section>
  );
}
