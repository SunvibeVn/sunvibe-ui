"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/features/auth/client";

import { type PreviewValue, publicPreviewModel } from "../lib/public-preview-model";
import { type Phrase, phraseText } from "../lib/revision-text";
import { getListingRevisionPublicPreview } from "../services/publication-api";
import type { ListingPublicPreview } from "../types";

/** The answer of one read, with the read it answers, so an answer of an earlier read never shows as the latest. */
type Answer = { asked: number; result: ApiResult<ListingPublicPreview> };

function Lines({ lines }: { lines: Phrase[] }) {
  const t = useTranslations("ListingPublish");
  return (
    <ul className="space-y-0.5">
      {lines.map((line, index) => (
        <li key={`${index}:${line.key}`} className="break-words">
          {phraseText(t, line)}
        </li>
      ))}
    </ul>
  );
}

/** One value as text nodes only: the revision's own text is never read as HTML or turned into a link. */
function Value({ value }: { value: PreviewValue }) {
  const t = useTranslations("ListingPublish");
  switch (value.kind) {
    case "text":
    case "paragraphs":
      return value.text;
    case "phrase":
      return phraseText(t, value.phrase);
    case "lines":
      return <Lines lines={value.lines} />;
    case "terms":
      return value.lines === null ? t("revision.terms.none") : <Lines lines={value.lines} />;
  }
}

/**
 * "Public preview" on the listing page (listing-publish US-2 AC-3, spec section 6, E06S7-D16 (a)): the public data of
 * the open revision as it would be published, read on "Show the public preview" and again on "Read again". The groups
 * of BR-14 in order, English labels and the revision's own text as typed. It shows data only; whether the display
 * conditions hold is the publication section's. The one 404 and a session answer show nothing.
 */
export function PublicPreviewSection({ listingId, revisionNo }: { listingId: string; revisionNo: number }) {
  const t = useTranslations("ListingPublish");
  const headingId = useId();
  /** The read asked for: 0 until "Show the public preview"; each read button asks for the next. */
  const [asked, setAsked] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (asked === 0) return;
    let dropped = false;
    void getListingRevisionPublicPreview(listingId, revisionNo).then((result) => {
      if (!dropped) setAnswer({ asked, result });
    });
    return () => {
      dropped = true;
    };
  }, [listingId, revisionNo, asked]);

  const read = () => setAsked((count) => count + 1);
  const result = answer !== null && answer.asked === asked ? answer.result : null;

  if (result !== null && !result.ok) {
    if (result.kind === "signed-out" || result.kind === "unavailable") return null;
    if (result.kind === "http" && result.status === 404) return null;
  }

  let body: ReactNode;
  if (asked === 0) {
    body = (
      <Button variant="secondary" className="px-4 py-2" onClick={read}>
        {t("preview.show")}
      </Button>
    );
  } else if (result === null) {
    body = (
      <p role="status" className="text-sm text-slate-500">
        {t("preview.loading")}
      </p>
    );
  } else if (!result.ok) {
    body = (
      <div className="space-y-2">
        <Alert tone="error">
          <p>{t("preview.loadError")}</p>
        </Alert>
        <Button variant="secondary" className="px-4 py-2" onClick={read}>
          {t("page.retry")}
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <dl className="space-y-3 text-sm">
          {publicPreviewModel(result.data).map((row) => (
            <div key={row.labelKey} className="space-y-0.5">
              <dt className="font-semibold text-slate-900">{t(row.labelKey)}</dt>
              <dd className={`break-words text-slate-800 ${row.value.kind === "paragraphs" ? "whitespace-pre-line" : ""}`}>
                <Value value={row.value} />
              </dd>
            </div>
          ))}
        </dl>
        <Button variant="secondary" className="px-4 py-2" onClick={read}>
          {t("preview.readAgain")}
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id={headingId} className="text-base font-semibold text-slate-900">
        {t("preview.title")}
      </h2>
      {body}
    </section>
  );
}
