"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/features/auth/client";

import { type RevisionCommand, type RevisionRun, type RevisionTermsScreen, termsLines } from "../lib/revision-model";
import { type Phrase, phraseText, sourceKey } from "../lib/revision-text";
import { runTermsCapture, type TermsSource } from "../lib/terms-capture-flow";
import { captureListingRevisionTerms, getListingTermsSources } from "../services/revision-api";
import type { ListingTermsSources } from "../types";

/** An instant on the staff page, as the listing page formats its times (the workspace provider sets the zone). */
const TIME_FORMAT = { dateStyle: "medium", timeStyle: "short" } as const;
/** A calendar day of E05 (`yyyy-mm-dd`): read and shown in UTC, so no time zone shifts the day. */
const DAY_FORMAT = { dateStyle: "medium", timeZone: "UTC" } as const;

type ReadOnlyProps = { editable: false; snapshot: RevisionTermsScreen | null };
type EditableProps = {
  editable: true;
  snapshot: RevisionTermsScreen | null;
  listingId: string;
  revisionNo: number;
  dataVersion: number;
  busy: RevisionCommand | null;
  run: RevisionRun;
  reread: () => void;
};

/** One source a snapshot can be taken from now, with its terms as lines. */
type SourceChoice = { source: TermsSource; startDate: string | null; lines: Phrase[] };

function choicesOf(sources: ListingTermsSources): SourceChoice[] {
  if (sources.ended) return [];
  const choices: SourceChoice[] = [];
  if (sources.inEffect !== null) choices.push({ source: "IN_EFFECT", startDate: null, lines: termsLines(sources.inEffect) });
  if (sources.pending !== null) {
    choices.push({ source: "PENDING_START", startDate: sources.pending.startDate, lines: termsLines(sources.pending.terms) });
  }
  return choices;
}

function useDayText() {
  const format = useFormatter();
  return (date: string | null) => {
    if (date === null) return "";
    const day = new Date(date);
    return Number.isNaN(day.getTime()) ? date : format.dateTime(day, DAY_FORMAT);
  };
}

function TermsLines({ lines, labelledBy }: { lines: Phrase[]; labelledBy?: string }) {
  const t = useTranslations("ListingPublish");
  return (
    <ul aria-labelledby={labelledBy} className="space-y-0.5 text-sm text-slate-700">
      {lines.map((line, index) => (
        <li key={`${index}:${line.key}`} className="break-words">
          {phraseText(t, line)}
        </li>
      ))}
    </ul>
  );
}

/** The sources of the assigned Sale's Draft as choices, and "Take this snapshot" through one request. */
function SourcePicker({ listingId, revisionNo, dataVersion, busy, run, reread }: Omit<EditableProps, "editable" | "snapshot">) {
  const t = useTranslations("ListingPublish");
  const dayText = useDayText();
  const group = useId();
  const [sources, setSources] = useState<ApiResult<ListingTermsSources> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState<TermsSource | null>(null);

  useEffect(() => {
    let dropped = false;
    void getListingTermsSources(listingId).then((result) => {
      if (!dropped) setSources(result);
    });
    return () => {
      dropped = true;
    };
  }, [listingId, attempt]);

  const rereadSources = () => setAttempt((count) => count + 1);

  if (sources === null) {
    return (
      <p role="status" className="text-sm text-slate-500">
        {t("revision.terms.sourcesLoading")}
      </p>
    );
  }
  if (!sources.ok) {
    // A session answer shows nothing here, as the rest of the page (E06S1-P8).
    if (sources.kind === "signed-out" || sources.kind === "unavailable") return null;
    return (
      <div className="space-y-2">
        <Alert tone="error">
          <p>{t("revision.terms.sourcesFailed")}</p>
        </Alert>
        <Button variant="secondary" className="px-4 py-2" onClick={rereadSources}>
          {t("revision.retry")}
        </Button>
      </div>
    );
  }
  const choices = choicesOf(sources.data);
  if (choices.length === 0) return <p className="text-sm text-slate-700">{t("revision.terms.noSource")}</p>;

  // The choice stays while its source is offered; else the first source offered is chosen.
  const choice = choices.find((entry) => entry.source === chosen)?.source ?? (choices[0] as SourceChoice).source;
  const taking = busy === "capture";
  const take = () =>
    void run("capture", () =>
      runTermsCapture(listingId, revisionNo, dataVersion, choice, {
        capture: (id, number, version, source) => captureListingRevisionTerms(id, number, version, source),
        reread,
        rereadSources,
      }),
    );

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium text-slate-700">{t("revision.terms.choose")}</legend>
      {choices.map((entry) => (
        <div key={entry.source} className="space-y-1 rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <input
              type="radio"
              name={group}
              checked={choice === entry.source}
              disabled={busy !== null}
              onChange={() => setChosen(entry.source)}
              className="h-4 w-4 shrink-0 accent-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
            />
            {t(sourceKey(entry.source), { date: dayText(entry.startDate) })}
          </label>
          <div className="pl-6">
            <TermsLines lines={entry.lines} />
          </div>
        </div>
      ))}
      <Button variant="secondary" className="px-4 py-2" pending={taking} disabled={busy !== null} onClick={take}>
        {taking ? t("revision.terms.taking") : t("revision.terms.take")}
      </Button>
    </fieldset>
  );
}

/**
 * The terms of a revision (listing-publish US-2 AC-2, BR-4, spec section 6, E06S2-D6): the snapshot read-only (where
 * it comes from, when it was taken and its lines), or "No terms snapshot yet."; for the assigned Sale's Draft also the
 * sources E05 offers now, as choices, and "Take this snapshot". Nothing here is typed: no request carries an amount.
 * Fee names are E05's content and render as text only (ADR-012 decision 1).
 */
export function RevisionTermsSection(props: ReadOnlyProps | EditableProps) {
  const t = useTranslations("ListingPublish");
  const format = useFormatter();
  const dayText = useDayText();
  const headingId = useId();
  const sourceId = useId();
  const { snapshot } = props;

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-2">
      <h3 id={headingId} className="text-sm font-semibold text-slate-900">
        {t("revision.terms.heading")}
      </h3>
      {snapshot === null ? (
        <p className="text-sm text-slate-700">{t("revision.terms.none")}</p>
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-slate-900">
            <span id={sourceId} className="font-medium">
              {t(snapshot.sourceKey, { date: dayText(snapshot.pendingStartDate) })}
            </span>{" "}
            <span className="text-slate-500">
              {t("revision.terms.taken", { time: format.dateTime(new Date(snapshot.capturedAt), TIME_FORMAT) })}
            </span>
          </p>
          <TermsLines lines={snapshot.lines} labelledBy={sourceId} />
        </div>
      )}
      {props.editable && (
        <SourcePicker
          listingId={props.listingId}
          revisionNo={props.revisionNo}
          dataVersion={props.dataVersion}
          busy={props.busy}
          run={props.run}
          reread={props.reread}
        />
      )}
    </section>
  );
}
