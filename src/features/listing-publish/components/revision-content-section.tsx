"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import type { RevisionScreen } from "../lib/revision-model";
import { type Phrase, phraseText } from "../lib/revision-text";

import { RevisionTermsSection } from "./revision-terms-section";

/** An instant on the staff page, as the listing page formats its times (the workspace provider sets the zone). */
const TIME_FORMAT = { dateStyle: "medium", timeStyle: "short" } as const;

/** A labelled list of lines, or `empty` when there is none. */
function Lines({ heading, lines, empty }: { heading: string; lines: Phrase[]; empty?: string }) {
  const t = useTranslations("ListingPublish");
  const headingId = useId();
  return (
    <div className="space-y-1">
      <h3 id={headingId} className="text-sm font-semibold text-slate-900">
        {heading}
      </h3>
      {lines.length === 0 ? (
        <p className="text-sm text-slate-700">{empty}</p>
      ) : (
        <ul aria-labelledby={headingId} className="space-y-0.5 text-sm text-slate-700">
          {lines.map((line, index) => (
            <li key={`${index}:${line.key}`} className="break-words">
              {phraseText(t, line)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A revision read-only (listing-publish US-2 AC-5, spec section 6): for a Draft seen by anyone but its assigned Sale,
 * and for every other status. The title and description are the Sale's content: text nodes with their line breaks,
 * never HTML or a link (ADR-012 decision 1, RD-13). Then the chosen features, the terms snapshot, the unit at
 * submission and, once submitted, that the content is locked.
 */
export function RevisionContentSection({ screen }: { screen: RevisionScreen }) {
  const t = useTranslations("ListingPublish");
  const format = useFormatter();
  const text = (value: string | null) => value ?? t("revision.notWritten");

  return (
    <div className="min-w-0 space-y-4">
      <dl className="space-y-3 text-sm">
        <div className="space-y-0.5">
          <dt className="font-semibold text-slate-900">{t("revision.title")}</dt>
          <dd className="break-words text-slate-800">{text(screen.title)}</dd>
        </div>
        <div className="space-y-0.5">
          <dt className="font-semibold text-slate-900">{t("revision.description")}</dt>
          <dd className="break-words whitespace-pre-line text-slate-800">{text(screen.description)}</dd>
        </div>
      </dl>
      <Lines heading={t("revision.features.heading")} lines={screen.features} empty={t("revision.features.none")} />
      <RevisionTermsSection editable={false} snapshot={screen.terms} />
      {screen.unit !== null && <Lines heading={t("revision.unit.heading")} lines={screen.unit} />}
      {screen.submittedAt !== null && (
        <p className="text-sm text-slate-700">
          {t("revision.submitted", { time: format.dateTime(new Date(screen.submittedAt), TIME_FORMAT) })}
        </p>
      )}
    </div>
  );
}
