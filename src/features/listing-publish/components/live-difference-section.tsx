"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { type LiveDifferenceModel, liveDifferenceModel, type LivePartValue } from "../lib/live-difference-model";
import { phraseText } from "../lib/revision-text";
import { getListingRevisionLiveDifference } from "../services/publication-api";

import { RevisionTermsSection } from "./revision-terms-section";

/** An instant on the staff page, as the listing page formats its times (the workspace provider sets the zone). */
const TIME_FORMAT = { dateStyle: "medium", timeStyle: "short" } as const;

/** The live revision's value of one changed part: text nodes only, never HTML or a link (ADR-012 decision 1). */
function LiveValue({ value }: { value: LivePartValue }) {
  const t = useTranslations("ListingPublish");
  const headingId = useId();
  switch (value.part) {
    case "TITLE":
    case "DESCRIPTION":
      return (
        <dl className="space-y-0.5 text-sm">
          <dt className="font-semibold text-slate-900">{t(value.part === "TITLE" ? "revision.title" : "revision.description")}</dt>
          <dd className={`break-words text-slate-800 ${value.part === "DESCRIPTION" ? "whitespace-pre-line" : ""}`}>{value.text}</dd>
        </dl>
      );
    case "FEATURES":
      return (
        <div className="space-y-1">
          <h3 id={headingId} className="text-sm font-semibold text-slate-900">
            {t("revision.features.heading")}
          </h3>
          {value.lines.length === 0 ? (
            <p className="text-sm text-slate-700">{t("revision.features.none")}</p>
          ) : (
            <ul aria-labelledby={headingId} className="space-y-0.5 text-sm text-slate-700">
              {value.lines.map((line, index) => (
                <li key={`${index}:${line.key}`} className="break-words">
                  {phraseText(t, line)}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    case "TERMS":
      return <RevisionTermsSection editable={false} snapshot={value.terms} />;
  }
}

/** What the section shows and the read it answered, so a re-read keeps it until it answers. */
type Shown = { model: LiveDifferenceModel; read: string };

/**
 * "Changes from the live revision" on the review page (listing-publish US-4 AC-2, spec section 6, E06S6-D12, D13): the
 * live revision and its time, the parts the asked revision changes by value and the live value of each; or that no
 * revision is live, or that the asked revision is the live one. It reads on mount and again each time the page re-reads
 * in place (`rereadAttempt`: after a decision's answer and on "Try again"), keeping what it shows meanwhile. The server
 * compares; nothing here is public.
 */
export function LiveDifferenceSection({
  listingId,
  revisionNo,
  rereadAttempt,
}: {
  listingId: string;
  revisionNo: number;
  /** The page's re-read counter: each change reads the section again. */
  rereadAttempt: number;
}) {
  const t = useTranslations("ListingPublish");
  const format = useFormatter();
  const locale = useLocale();
  const headingId = useId();
  const [shown, setShown] = useState<Shown | null>(null);
  /** Moves on "Try again" of a failed first read. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let dropped = false;
    const read = `${rereadAttempt}:${attempt}`;
    void getListingRevisionLiveDifference(listingId, revisionNo).then((result) => {
      if (dropped) return;
      const next = liveDifferenceModel(result);
      // A failed re-read keeps what is shown, as the page does.
      setShown((current) =>
        current !== null && current.model.kind !== "error" && current.model.kind !== "loading" && next.kind === "error"
          ? { model: current.model, read }
          : { model: next, read },
      );
    });
    return () => {
      dropped = true;
    };
  }, [listingId, revisionNo, rereadAttempt, attempt]);

  const model: LiveDifferenceModel = shown?.model ?? { kind: "loading" };
  if (model.kind === "none") return null;

  const retry = () => {
    setShown(null);
    setAttempt((count) => count + 1);
  };

  let body: ReactNode;
  switch (model.kind) {
    case "loading":
      body = (
        <p role="status" className="text-sm text-slate-500">
          {t("liveDifference.loading")}
        </p>
      );
      break;
    case "error":
      body = (
        <div className="space-y-2">
          <Alert tone="error">
            <p>{t("liveDifference.loadError")}</p>
          </Alert>
          <Button variant="secondary" className="px-4 py-2" onClick={retry}>
            {t("review.retry")}
          </Button>
        </div>
      );
      break;
    case "noLive":
      body = <p className="text-sm text-slate-700">{t("liveDifference.noLive")}</p>;
      break;
    case "isLive":
      body = <p className="text-sm text-slate-700">{t("liveDifference.isLive")}</p>;
      break;
    case "compared": {
      const parts = new Intl.ListFormat(locale, { type: "unit", style: "long" }).format(model.changedPartKeys.map((key) => t(key)));
      body = (
        <div className="space-y-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">
            {t("liveDifference.liveSince", { revisionNo: model.liveRevisionNo, time: format.dateTime(new Date(model.wentLiveAt), TIME_FORMAT) })}
          </p>
          {model.changedPartKeys.length === 0 ? (
            <p>{t("liveDifference.noChange")}</p>
          ) : (
            <p>{t("liveDifference.changed", { parts })}</p>
          )}
          {model.values.length > 0 && (
            <div className="min-w-0 space-y-3">
              <p className="font-medium text-slate-900">{t("liveDifference.liveValues")}</p>
              {model.values.map((value) => (
                <LiveValue key={value.part} value={value} />
              ))}
            </div>
          )}
        </div>
      );
      break;
    }
  }

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id={headingId} className="text-base font-semibold text-slate-900">
        {t("liveDifference.title")}
      </h2>
      {body}
    </section>
  );
}
