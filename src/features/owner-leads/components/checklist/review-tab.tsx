"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { OwnerLeadsKey } from "@/features/lead-shared";
import { reviewReasonKey } from "@/features/surveys";

import { previewModel } from "../../../surveys/lib/checklist/preview-model";
import {
  afterDecision,
  decisionConsequenceKey,
  decisionFailureTexts,
  evidenceRows,
  isReviewValid,
  passedBlockers,
  reviewAccess,
  type ReviewForm,
  reviewProblems,
  toDecisionInput,
  withMark,
} from "../../../surveys/lib/checklist/review-model";
import { createInFlightGuard } from "../../../surveys/lib/checklist/submission-model";

import { useChecklistPage } from "./checklist-context";
import { ChecklistSections } from "./checklist-sections";
import { DecisionForm } from "./decision-form";
import { EarlierDecisions } from "./earlier-decisions";
import { EvidenceReviewList } from "./evidence-review-list";
import { useChecklistMedia } from "./media-context";
import type { ChainLoad } from "./use-revision-chain";

type Failure = { texts: OwnerLeadsKey[]; correlationId?: string };

function OpenItems({ title, lines }: { title: string; lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="space-y-1 text-sm">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-slate-800">
        {lines.map((line, index) => (
          <li key={`${line}-${index}`} className="break-words">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

type ReviewTabProps = {
  /** Held by the page, so a switch of tab keeps it; in page memory only. */
  form: ReviewForm;
  onChange(update: (form: ReviewForm) => ReviewForm): void;
  /** The earlier revisions, read once by the page. */
  chain: ChainLoad;
  onRetryChain(): void;
};

/**
 * The Review tab of a SUBMITTED revision (survey-checklist submission spec 6.1): the media v1 banner, the earlier
 * decisions of the chain, the frozen record, the frozen photos with their marks and the decision form. A refused
 * decision keeps the form; the server stays the judge of every rule (U-3). A decision cannot be changed, so it asks once
 * more and says where it takes the lead.
 */
export function ReviewTab({ form, onChange, chain, onRetryChain }: ReviewTabProps) {
  const t = useTranslations("OwnerLeads");
  const surveys = useTranslations("Surveys");
  const { view, locks, decide } = useChecklistPage();
  const media = useChecklistMedia();
  const [guard] = useState(createInFlightGuard);
  /** Problems show from the first try on. */
  const [tried, setTried] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  /** Counts the tries that stopped at a problem, for the focus below. */
  const [stopped, setStopped] = useState(0);
  const noticeRef = useRef<HTMLDivElement>(null);
  const model = useMemo(() => previewModel(view, t), [view, t]);
  const sections = useMemo(() => model.sections.filter((section) => section.group !== "evidence"), [model]);
  const rows = evidenceRows(view, media?.model ?? null);
  const blockers = passedBlockers(view, form);
  const problems = reviewProblems(form, view);
  // The review ended while the viewer worked: what they typed stays readable, nothing can be sent (I-1).
  const blocked = reviewAccess(view, form) === "blocked";
  const locked = pending || locks.all || blocked;
  const invalid = tried && !isReviewValid(problems);
  // Adjusting state while rendering: the confirm step of a review that ended is over, also when a read ended it.
  if (blocked && confirming && !pending) setConfirming(false);

  // A problem may sit far above the button, and the opener of the confirm step may be disabled by now.
  useEffect(() => {
    if (failure !== null || stopped > 0 || blocked) noticeRef.current?.focus();
  }, [failure, stopped, blocked]);

  const send = () =>
    void guard.run(async () => {
      setPending(true);
      setFailure(null);
      const result = await decide(toDecisionInput(form, view));
      setPending(false);
      setConfirming(false);
      onChange((current) => afterDecision(current, result));
      if (result.kind === "failed" || result.kind === "unknown") {
        const { correlationId } = result.error;
        const texts: OwnerLeadsKey[] = result.kind === "unknown" ? ["checklist.review.errors.unknown"] : decisionFailureTexts(result.error);
        setFailure(correlationId === undefined ? { texts } : { texts, correlationId });
      }
    });

  return (
    <div className="space-y-4">
      <Alert tone="info">{t("checklist.review.mediaBanner")}</Alert>
      {/* A review that ended keeps only what the viewer typed: the other tabs still show the record. */}
      {!blocked && (
        <>
          <EarlierDecisions chain={chain} onRetry={onRetryChain} />
          {(model.warnings.length > 0 || model.unconfirmed.length > 0) && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <OpenItems title={t("checklist.review.open.warnings")} lines={model.warnings} />
              <OpenItems title={t("checklist.review.open.unconfirmed")} lines={model.unconfirmed.map((line) => line.text)} />
            </div>
          )}
          <ChecklistSections sections={sections} idPrefix="rv" />
        </>
      )}
      <EvidenceReviewList
        rows={rows}
        marks={form.marks}
        problems={tried ? problems.marks : {}}
        disabled={locked}
        onMark={(mediaId, mark) => onChange((current) => withMark(current, mediaId, mark))}
      />
      <section aria-labelledby="cl-decision-form-title" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 id="cl-decision-form-title" className="text-base font-semibold text-slate-900">
          {t("checklist.review.form.title")}
        </h2>
        <DecisionForm form={form} onChange={onChange} blockers={blockers} problems={tried ? problems.fields : {}} disabled={locked} />
        <div ref={noticeRef} tabIndex={-1} aria-live="polite" className="space-y-2 focus:outline-none">
          {blocked && (
            <Alert tone="info">
              <p>{surveys(reviewReasonKey(view.review?.reason))}</p>
              <p className="mt-1">{t("checklist.review.keptText")}</p>
            </Alert>
          )}
          {invalid && <Alert tone="error">{t("checklist.review.form.fixProblems")}</Alert>}
          {failure !== null && (
            <Alert tone="error">
              {failure.texts.map((text) => (
                <p key={text}>{t(text)}</p>
              ))}
              {failure.correlationId !== undefined && (
                <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: failure.correlationId })}</p>
              )}
            </Alert>
          )}
        </div>
        <Button
          disabled={locked}
          onClick={() => {
            setTried(true);
            setFailure(null);
            if (isReviewValid(problems)) setConfirming(true);
            else setStopped((count) => count + 1);
          }}
        >
          {t("checklist.review.form.send")}
        </Button>
      </section>
      {confirming && !blocked && (
        <Dialog
          open
          onClose={pending ? () => undefined : () => setConfirming(false)}
          title={t("checklist.review.confirm.title")}
          closeLabel={pending ? undefined : t("checklist.review.confirm.cancel")}
          footer={
            <>
              <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
                {t("checklist.review.confirm.cancel")}
              </Button>
              <Button pending={pending} onClick={send}>
                {pending ? t("checklist.review.confirm.sending") : t("checklist.review.confirm.send")}
              </Button>
            </>
          }
        >
          <div className="space-y-2 text-sm text-slate-800">
            <p className="font-medium text-slate-900">{t(decisionConsequenceKey(form))}</p>
            <p>{t("checklist.review.confirm.text")}</p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
