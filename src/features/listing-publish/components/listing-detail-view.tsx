"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { ListingChange } from "../lib/freshness-record-flow";
import { listingModel, type ListingPageModel } from "../lib/listing-model";
import { type RevisionDecisionInput, revisionDecisionInput } from "../lib/revision-decision-model";
import { getListing } from "../services/listing-api";

import { FreshnessPanel } from "./freshness-panel";
import { PublicationSection } from "./publication-section";
import { PublicPreviewSection } from "./public-preview-section";
import { RevisionDecisionSection } from "./revision-decision-section";
import { RevisionPanel } from "./revision-panel";

const LOADING: ListingPageModel = { kind: "loading" };

/** The listing re-reads: how many were asked for, and the last asked for by the revision panel and by a record. */
type Rereads = { refresh: number; revision: number; record: number };

/** An instant on the staff page, as the agreement page formats its times (the workspace provider sets the zone). */
const TIME_FORMAT = { dateStyle: "medium", timeStyle: "short" } as const;

/**
 * The workspace page of one listing (listing-publish US-1 AC-4, spec section 6, UL-3): its public code, state,
 * transaction type and creation time, a way back to its agreement, and its newest revisions, newest first. It says
 * that only the live revision can be public, and only while every display condition holds (E06S7-D16 (c)). No unit
 * address, owner or person. It reads on mount and on "Try again".
 * "Publication" (E06-S6) sits between "Freshness" and "Current revision" and reads again on each re-read of the page.
 * "Public preview" (E06-S7) follows "Current revision" for the open revision only, and reads on its own buttons.
 * The "Current revision" panel (E06-S2) sits above the revisions; after each of its commands the page reads the listing
 * again in place, keeping what it shows until the answer, so the panel and its alert stay (E06S2-P11 (2)): a 404 shows
 * the not-found state, and a failed re-read keeps the page as it is. Until that answer the panel's commands wait, since
 * the page still holds the old data version.
 */
export function ListingDetailView({ listingId }: { listingId: string }) {
  const t = useTranslations("ListingPublish");
  const format = useFormatter();
  const [model, setModel] = useState<ListingPageModel>(LOADING);
  /** The newest decided revision of the last listing read that answered, for "Latest review" (E06S4-P12); null: none. */
  const [decisionInput, setDecisionInput] = useState<RevisionDecisionInput | null>(null);
  const [attempt, setAttempt] = useState(0);
  /**
   * `refresh` counts the listing re-reads; `revision` and `record` hold the `refresh` the revision panel and a record
   * last asked for (E06S3-D12), so each panel waits only for the re-read that concerns it.
   */
  const [rereads, setRereads] = useState<Rereads>({ refresh: 0, revision: 0, record: 0 });
  const { refresh } = rereads;
  /** The `refresh` of the last read that answered: behind `refresh` while a re-read runs. */
  const [answered, setAnswered] = useState(0);
  /** Moves after each record: the revision panel reads its open revision again (E06S3-D12). */
  const [outsideChange, setOutsideChange] = useState(0);
  const revisionsId = useId();

  useEffect(() => {
    let dropped = false;
    void getListing(listingId).then((result) => {
      if (dropped) return;
      const next = listingModel(result);
      setModel((current) => (current.kind === "ready" && next.kind === "error" ? current : next));
      if (result.ok) setDecisionInput(revisionDecisionInput(result.data));
      setAnswered(refresh);
    });
    return () => {
      dropped = true;
    };
  }, [listingId, attempt, refresh]);

  // Next keeps this route hidden (Activity): nothing of the listing stays in it, and the next read starts as the first.
  useLayoutEffect(
    () => () => {
      setModel(LOADING);
      setDecisionInput(null);
    },
    [],
  );

  const retry = () => {
    setModel(LOADING);
    setAttempt((count) => count + 1);
  };
  /** Reads the listing again in place, remembering which panel asked for it (none for a plain re-read). */
  const reread = (asker: "revision" | "record" | null) =>
    setRereads((current) => {
      const next = current.refresh + 1;
      return { refresh: next, revision: asker === "revision" ? next : current.revision, record: asker === "record" ? next : current.record };
    });
  // A record moved the data version: a re-read held as a record's, and the revision panel reads its revision again. A
  // 409 CONCURRENT_MODIFICATION: the page holds an old version, re-read as a record's, no record made. A 404: plain.
  const freshnessChanged = (change: ListingChange) => {
    if (change === "gone") {
      reread(null);
      return;
    }
    reread("record");
    if (change === "recorded") setOutsideChange((count) => count + 1);
  };
  const time = (instant: string) => format.dateTime(new Date(instant), TIME_FORMAT);

  switch (model.kind) {
    case "hidden":
      return null;
    case "loading":
      return (
        <p role="status" className="text-sm text-slate-500">
          {t("page.loading")}
        </p>
      );
    case "not-found":
      return (
        <Alert tone="info">
          <p>{t("page.notFound")}</p>
        </Alert>
      );
    case "error":
      return (
        <div className="space-y-3">
          <Alert tone="error">
            <p>{t("page.loadFailed")}</p>
          </Alert>
          <Button variant="secondary" onClick={retry}>
            {t("page.retry")}
          </Button>
        </div>
      );
    case "ready":
      return (
        <div className="space-y-4">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h1 className="break-words text-xl font-semibold text-slate-900">{t("page.title", { code: model.code })}</h1>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">{t("page.state")}</dt>
                <dd className="font-semibold text-slate-900">{t(model.stateKey)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("page.transaction")}</dt>
                <dd className="text-slate-900">{t(model.transactionKey)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("page.created")}</dt>
                <dd className="text-slate-900">{time(model.createdAt)}</dd>
              </div>
            </dl>
            <Link
              href={model.agreementHref}
              prefetch={false}
              className="inline-flex text-sm font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
            >
              {t("page.openAgreement")}
            </Link>
          </div>
          <FreshnessPanel
            listingId={listingId}
            dataVersion={model.revisionPanel.dataVersion}
            viewerMayRecord={model.revisionPanel.viewerMayDraft}
            agreementHref={model.agreementHref}
            listingRereading={answered !== refresh}
            onListingChanged={freshnessChanged}
          />
          <PublicationSection listingId={listingId} refresh={refresh} onListingChanged={() => reread("revision")} />
          <RevisionPanel
            listingId={listingId}
            panel={model.revisionPanel}
            listingRereading={answered < rereads.revision}
            onListingChanged={() => reread("revision")}
            outsideChange={outsideChange}
            outsideRereading={answered < rereads.record}
          />
          {model.revisionPanel.openRevisionNo !== null && (
            <PublicPreviewSection
              key={model.revisionPanel.openRevisionNo}
              listingId={listingId}
              revisionNo={model.revisionPanel.openRevisionNo}
            />
          )}
          {decisionInput !== null && (
            <RevisionDecisionSection
              key={decisionInput.revisionNo}
              listingId={listingId}
              input={decisionInput}
              onListingChanged={() => reread("revision")}
            />
          )}
          <section
            aria-labelledby={revisionsId}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
          >
            <h2 id={revisionsId} className="text-base font-semibold text-slate-900">
              {t("page.revisions")}
            </h2>
            <ol className="divide-y divide-slate-100">
              {model.revisions.map((revision) => (
                <li key={revision.revisionNo} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
                  <span className="text-sm font-semibold text-slate-900">
                    {t("page.revision", { revisionNo: revision.revisionNo })}
                  </span>
                  <Badge>{t(revision.statusKey)}</Badge>
                  <span className="text-sm text-slate-600">{t("page.revisionCreated", { time: time(revision.createdAt) })}</span>
                </li>
              ))}
            </ol>
            {model.olderRevisions && <p className="text-sm text-slate-500">{t("page.olderRevisions")}</p>}
          </section>
          <p className="text-sm text-slate-700">{t("page.publicRule")}</p>
        </div>
      );
  }
}
