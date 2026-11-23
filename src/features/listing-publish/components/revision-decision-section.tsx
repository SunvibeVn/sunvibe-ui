"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/features/auth/client";

import { runRevisionCopy } from "../lib/revision-copy-flow";
import { type RevisionDecisionInput, revisionDecisionModel } from "../lib/revision-decision-model";
import type { ListingKey } from "../lib/revision-text";
import { copyListingRevision, getListingRevisionDecision } from "../services/review-api";
import type { ListingRevisionDecision } from "../types";

/** An instant on the staff page, as the listing page formats its times (the workspace provider sets the zone). */
const TIME_FORMAT = { dateStyle: "medium", timeStyle: "short" } as const;

/** The decision read, with the revision number and the attempt it was read for. */
type DecisionRead = { revisionNo: number; attempt: number; result: ApiResult<ListingRevisionDecision> };

/** The copy: sending, sent (the button waits for the listing's answer), or refused with its sentence. */
type CopyState = { kind: "idle" } | { kind: "copying" } | { kind: "copied" } | { kind: "refused"; sentence: ListingKey };

/**
 * "Latest review" on the listing page (listing-publish US-4 AC-6, US-2 AC-6, spec section 6, E06S4-D14, D15, D17): the
 * decision of the newest decided revision (its number, the outcome, the time, the reasons or the group, the reviewer's
 * note as text only), also while a Draft is open, so the Sale keeps it in sight. "Copy into a new draft" for a return,
 * for the assigned Sale, while no revision is open: sent once, then the page reads the listing again. A rejection says
 * why it cannot be copied. Nothing at all for the one 404. The server decides the copy.
 */
export function RevisionDecisionSection({
  listingId,
  input,
  onListingChanged,
}: {
  listingId: string;
  input: RevisionDecisionInput;
  /** The page reads the listing again after the copy's answer (`reread("revision")`). */
  onListingChanged: () => void;
}) {
  const t = useTranslations("ListingPublish");
  const format = useFormatter();
  const headingId = useId();
  const [read, setRead] = useState<DecisionRead | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [copy, setCopy] = useState<CopyState>({ kind: "idle" });
  const sending = useRef(false);
  const { revisionNo } = input;

  useEffect(() => {
    let dropped = false;
    void getListingRevisionDecision(listingId, revisionNo).then((result) => {
      if (!dropped) setRead({ revisionNo, attempt, result });
    });
    return () => {
      dropped = true;
    };
  }, [listingId, revisionNo, attempt]);

  const current = read !== null && read.revisionNo === revisionNo && read.attempt === attempt ? read.result : null;
  const model = revisionDecisionModel(current, input);
  if (model.kind === "none") return null;

  const retry = () => setAttempt((count) => count + 1);
  const copyIt = () => {
    if (sending.current) return;
    sending.current = true;
    setCopy({ kind: "copying" });
    void runRevisionCopy(
      { listingId, revisionNo, dataVersion: input.dataVersion },
      { copy: (id, number, version) => copyListingRevision(id, number, version), reread: onListingChanged },
    ).then((outcome) => {
      sending.current = false;
      if (outcome.kind === "copied") setCopy({ kind: "copied" });
      else if (outcome.kind === "refused") setCopy({ kind: "refused", sentence: outcome.sentence });
      else setCopy({ kind: "idle" });
    });
  };

  let body;
  if (model.kind === "loading") {
    body = (
      <p role="status" className="text-sm text-slate-500">
        {t("decision.loading")}
      </p>
    );
  } else if (model.kind === "error") {
    body = (
      <div className="space-y-2">
        <Alert tone="error">
          <p>{t("decision.loadFailed")}</p>
        </Alert>
        <Button variant="secondary" className="px-4 py-2" onClick={retry}>
          {t("decision.retry")}
        </Button>
      </div>
    );
  } else {
    const copying = copy.kind === "copying";
    body = (
      <div className="space-y-3 text-sm text-slate-700">
        <p className="font-medium text-slate-900">{t("decision.statusLine", { revisionNo: model.revisionNo, outcome: t(model.outcomeKey) })}</p>
        <p>{t("decision.decidedAt", { time: format.dateTime(new Date(model.decidedAt), TIME_FORMAT) })}</p>
        {model.reasonKeys.length > 0 && (
          <div className="space-y-1">
            <p>{t("decision.reasons")}</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {model.reasonKeys.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </div>
        )}
        {model.groupKey !== null && <p>{t("decision.groupLine", { group: t(model.groupKey) })}</p>}
        {model.note !== null && (
          <div className="space-y-0.5">
            <p className="font-medium text-slate-900">{t("decision.note")}</p>
            <p className="break-words whitespace-pre-line text-slate-800">{model.note}</p>
          </div>
        )}
        {model.rejected && <p>{t("decision.rejected")}</p>}
        {copy.kind === "refused" && (
          <Alert tone="error">
            <p>{t(copy.sentence)}</p>
          </Alert>
        )}
        {model.mayCopy && copy.kind !== "copied" && (
          <Button className="px-4 py-2" pending={copying} disabled={copying} onClick={copyIt}>
            {copying ? t("decision.copying") : t("decision.copy")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id={headingId} className="text-base font-semibold text-slate-900">
        {t("decision.heading")}
      </h2>
      {body}
    </section>
  );
}
