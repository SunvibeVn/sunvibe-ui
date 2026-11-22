"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useEffectEvent, useId, useLayoutEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/features/auth/client";
import { LISTING_REVIEWS_PATH } from "@/features/workspace";

import { type DecisionFormValues, EMPTY_DECISION_FORM } from "../lib/review-decision-form";
import { type DecisionFormState, decisionFormStateOf, type ReviewDecisionOutcome } from "../lib/review-decision-flow";
import { rereadOutcome, type ReviewReady, reviewPageModel, revisionNoOf } from "../lib/revision-review-model";
import { type Phrase, phraseText } from "../lib/revision-text";
import { getListingRevisionReview } from "../services/review-api";
import { getListingRevision } from "../services/revision-api";
import type { ListingRevisionDetail, ListingRevisionReview } from "../types";

import { ReviewAnswerNotice } from "./review-answer-notice";
import { ReviewDecisionForm } from "./review-decision-form";
import { RevisionContentSection } from "./revision-content-section";
import { UnitLocationSection } from "./unit-location-section";

/** The two reads of the page and the attempt they were started for. */
type Reads = { review: ApiResult<ListingRevisionReview> | null; revision: ApiResult<ListingRevisionDetail> | null };

const NO_READS: Reads = { review: null, revision: null };

const LINK_CLASS =
  "inline-flex text-sm font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/** One section of the page: a region named by its own heading. */
function ReviewSection({ heading, children }: { heading: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id={headingId} className="text-base font-semibold text-slate-900">
        {heading}
      </h2>
      {children}
    </section>
  );
}

function Lines({ lines }: { lines: Phrase[] }) {
  const t = useTranslations("ListingPublish");
  return (
    <ul className="space-y-0.5 text-sm text-slate-700">
      {lines.map((line, index) => (
        <li key={`${index}:${line.key}`} className="break-words">
          {phraseText(t, line)}
        </li>
      ))}
    </ul>
  );
}

/** "Agreement": E05's answer for the listing's unit and agreement (E06S4-D11, D13); E05's terms are its content. */
function AgreementSection({ agreement }: { agreement: ReviewReady["agreement"] }) {
  const t = useTranslations("ListingPublish");
  if (agreement === null) return <p className="text-sm text-slate-700">{t("review.agreement.noAnswer")}</p>;
  const answer = (yes: boolean) => t(yes ? "review.agreement.yes" : "review.agreement.no");
  return (
    <div className="space-y-3 text-sm text-slate-700">
      {agreement.allowed ? (
        <p>{t("review.agreement.allowed")}</p>
      ) : (
        <div className="space-y-1">
          <p>{t("review.agreement.notAllowed")}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {agreement.reasonKeys.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </div>
      )}
      <p>{agreement.endDate === null ? t("review.agreement.noEnd") : t("review.agreement.endsOn", { date: agreement.endDate })}</p>
      <p>{t("review.agreement.interiorPhotos", { answer: answer(agreement.interiorPhotos) })}</p>
      <p>{t("review.agreement.exteriorPhotos", { answer: answer(agreement.exteriorPhotos) })}</p>
      <div className="space-y-1">
        <h3 className="font-semibold text-slate-900">{t("review.agreement.termsInEffect")}</h3>
        {agreement.termsInEffect === null ? <p>{t("review.agreement.noTermsInEffect")}</p> : <Lines lines={agreement.termsInEffect} />}
      </div>
      {agreement.pending !== null && (
        <div className="space-y-1">
          <h3 className="font-semibold text-slate-900">{t("review.agreement.pending", { date: agreement.pending.startDate })}</h3>
          <Lines lines={agreement.pending.lines} />
        </div>
      )}
    </div>
  );
}

/**
 * The page once both reads answered: header, the answers of a decision, eligibility, content, the five sections of
 * context, and `decision` (the form) last.
 */
function ReviewBody({
  listingId,
  model,
  notices,
  decision,
}: {
  listingId: string;
  model: ReviewReady;
  notices: ReactNode;
  decision: ReactNode;
}) {
  const t = useTranslations("ListingPublish");
  const { unit, freshness } = model;
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h1 className="break-words text-xl font-semibold text-slate-900">{t("review.heading", { code: model.code })}</h1>
        <p className="text-sm font-medium text-slate-900">
          {t("review.statusLine", { revisionNo: model.revisionNo, status: t(model.statusKey) })}
        </p>
        <Link href={LISTING_REVIEWS_PATH} prefetch={false} className={LINK_CLASS}>
          {t("review.backToQueue")}
        </Link>
      </div>
      {notices}
      {!model.mayDecide && (
        <Alert tone="info">
          <p>{t("review.notEligible")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {model.reasonKeys.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </Alert>
      )}
      <ReviewSection heading={t("review.content")}>
        <RevisionContentSection screen={model.screen} />
      </ReviewSection>
      <ReviewSection heading={t("review.agreement.heading")}>
        <AgreementSection agreement={model.agreement} />
      </ReviewSection>
      <ReviewSection heading={t("review.termsCheck")}>
        <p className="text-sm text-slate-700">{t(model.termsMatchKey)}</p>
      </ReviewSection>
      <ReviewSection heading={t("review.unit.heading")}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">{t("review.unit.code")}</dt>
            <dd className="break-words text-slate-900">{unit.code ?? t("review.unit.notKnown")}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("review.unit.ward")}</dt>
            <dd className="break-words text-slate-900">{unit.ward ?? t("review.unit.notKnown")}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("review.unit.availability")}</dt>
            <dd className="text-slate-900">{unit.availabilityKey === null ? t("review.unit.notKnown") : t(unit.availabilityKey)}</dd>
          </div>
        </dl>
        {unit.availabilityDiffers && <p className="text-sm text-slate-700">{t("review.unit.availabilityDiffers")}</p>}
        {model.mayDecide && <UnitLocationSection listingId={listingId} revisionNo={model.revisionNo} />}
      </ReviewSection>
      <ReviewSection heading={t("review.freshness.heading")}>
        <div className="space-y-1 text-sm text-slate-700">
          {freshness.confirmedOn === null ? (
            <p>{t("review.freshness.noValid")}</p>
          ) : (
            <p>{t("review.freshness.latestValid", { date: freshness.confirmedOn })}</p>
          )}
          {freshness.validThrough !== null && (
            <p className="flex flex-wrap items-center gap-2">
              <span>{t("review.freshness.validThrough", { date: freshness.validThrough })}</span>
              {freshness.deadlinePassed && <Badge tone="danger">{t("review.freshness.expired")}</Badge>}
            </p>
          )}
          {freshness.validThrough === null && freshness.deadlinePassed && <Badge tone="danger">{t("review.freshness.expired")}</Badge>}
          {freshness.latestValid === false && <p>{t("review.freshness.notValid")}</p>}
        </div>
      </ReviewSection>
      <ReviewSection heading={t("review.checklist")}>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          {model.checklist.map((item) => (
            <li key={item.code}>{t(item.key)}</li>
          ))}
        </ol>
      </ReviewSection>
      {decision}
    </div>
  );
}

/** The model a re-read in place replaced the first one with, and whether that re-read failed. */
type Shown = { model: ReviewReady; rereadFailed: boolean };

/**
 * The review of one revision (listing-publish US-4 AC-2 to AC-5, spec section 6, E06S4-D11, D12, D17): both the review
 * read (eligibility, E05's answer, the terms check, the unit, the freshness, the checklist, the data version and the
 * listing's code) and the revision read (the content) start together, and the page shows nothing of either until both
 * answered. The real location is opened only on request, and only where the server says the reader may decide. The
 * revision number of the address is read only in canonical form; anything else is the 404 with no request.
 *
 * Where the reader may decide, the decision form follows. After a 200, a 403 `REVIEWER_NOT_INDEPENDENT` or a 409 both
 * reads run again in place: what is shown stays (no loading state) and the form waits until they answer; then the
 * form keeps every value exactly when the re-read says the reader may still decide, and sends the re-read's data
 * version. An answer that removes the form keeps its sentence on the page; a failed re-read keeps what is shown,
 * without the form, with "Try again".
 */
export function RevisionReviewView({ listingId, revisionNo }: { listingId: string; revisionNo: string }) {
  const t = useTranslations("ListingPublish");
  const number = revisionNoOf(revisionNo);
  const [reads, setReads] = useState<Reads>(NO_READS);
  const [attempt, setAttempt] = useState(0);
  /** What a re-read in place answered last; null until one did. */
  const [shown, setShown] = useState<Shown | null>(null);
  /** Moves for each re-read in place; `rereading` until both its reads answered. */
  const [rereadAttempt, setRereadAttempt] = useState(0);
  const [rereading, setRereading] = useState(false);
  const [values, setValues] = useState<DecisionFormValues>(EMPTY_DECISION_FORM);
  /** The sentence of the last answer that asked for a re-read, shown by the page when the form is gone. */
  const [answer, setAnswer] = useState<DecisionFormState | null>(null);
  const [recorded, setRecorded] = useState(false);

  useEffect(() => {
    if (number === null) return;
    let dropped = false;
    void getListingRevisionReview(listingId, number).then((review) => {
      if (!dropped) setReads((current) => ({ ...current, review }));
    });
    void getListingRevision(listingId, number).then((revision) => {
      if (!dropped) setReads((current) => ({ ...current, revision }));
    });
    return () => {
      dropped = true;
    };
  }, [listingId, number, attempt]);

  const first = number === null ? ({ kind: "notFound" } as const) : reviewPageModel(reads.review, reads.revision);
  const current = shown?.model ?? (first.kind === "ready" ? first : null);

  const rereadAnswered = useEffectEvent(
    (review: ApiResult<ListingRevisionReview>, revision: ApiResult<ListingRevisionDetail>) => {
      setRereading(false);
      if (current === null) return;
      const outcome = rereadOutcome(current, review, revision);
      setShown({ model: outcome.model, rereadFailed: outcome.rereadFailed });
      // The form's values go only when the re-read says the reader may no longer decide; a failed re-read keeps them.
      if (!outcome.keepForm && !outcome.rereadFailed) setValues(EMPTY_DECISION_FORM);
    },
  );

  useEffect(() => {
    if (rereadAttempt === 0 || number === null) return;
    let dropped = false;
    let review: ApiResult<ListingRevisionReview> | null = null;
    let revision: ApiResult<ListingRevisionDetail> | null = null;
    const settle = () => {
      if (!dropped && review !== null && revision !== null) rereadAnswered(review, revision);
    };
    void getListingRevisionReview(listingId, number).then((result) => {
      review = result;
      settle();
    });
    void getListingRevision(listingId, number).then((result) => {
      revision = result;
      settle();
    });
    return () => {
      dropped = true;
    };
  }, [listingId, number, rereadAttempt]);

  // Next keeps this route hidden (Activity): nothing of the review stays in it, and the next read starts as the first.
  useLayoutEffect(
    () => () => {
      setReads(NO_READS);
      setShown(null);
      setValues(EMPTY_DECISION_FORM);
      setAnswer(null);
      setRecorded(false);
    },
    [],
  );

  const retry = () => {
    setReads(NO_READS);
    setAttempt((count) => count + 1);
  };
  const reread = () => {
    setRereading(true);
    setRereadAttempt((count) => count + 1);
  };
  const decisionAnswered = (outcome: ReviewDecisionOutcome) => {
    if (outcome.kind === "decided") {
      setRecorded(true);
      setAnswer(null);
      setValues(EMPTY_DECISION_FORM);
      reread();
    } else if (outcome.kind === "reread") {
      setAnswer(decisionFormStateOf(outcome));
      reread();
    } else {
      setAnswer(null);
    }
  };

  if (current !== null) {
    const rereadFailed = shown?.rereadFailed === true;
    const formShown = current.mayDecide && !recorded && !rereadFailed;
    const notices = (
      <>
        {recorded && (
          <Alert tone="success">
            <p>{t("review.recorded")}</p>
          </Alert>
        )}
        {!formShown && answer?.messageKey !== undefined && <ReviewAnswerNotice messageKey={answer.messageKey} reasonKeys={answer.reasonKeys} />}
        {rereadFailed && (
          <div className="space-y-2">
            <Alert tone="error">
              <p>{t("review.rereadFailed")}</p>
            </Alert>
            <Button variant="secondary" className="px-4 py-2" disabled={rereading} onClick={reread}>
              {t("review.retry")}
            </Button>
          </div>
        )}
      </>
    );
    const decision = formShown && (
      <ReviewSection heading={t("review.decision.heading")}>
        <ReviewDecisionForm
          listingId={listingId}
          revisionNo={current.revisionNo}
          dataVersion={current.dataVersion}
          checklist={current.checklist.map((item) => item.code)}
          termsMatch={current.termsMatch}
          values={values}
          onValues={setValues}
          held={rereading}
          onOutcome={decisionAnswered}
        />
      </ReviewSection>
    );
    return <ReviewBody listingId={listingId} model={current} notices={notices} decision={decision} />;
  }

  switch (first.kind) {
    case "ready":
      // Shown above, as `current`.
      return null;
    case "hidden":
      return null;
    case "loading":
      return (
        <p role="status" className="text-sm text-slate-500">
          {t("review.loading")}
        </p>
      );
    case "forbidden":
      return (
        <Alert tone="info">
          <p>{t("review.forbidden")}</p>
        </Alert>
      );
    case "notFound":
      return (
        <div className="space-y-3">
          <Alert tone="info">
            <p>{t("review.notFound")}</p>
          </Alert>
          <Link href={LISTING_REVIEWS_PATH} prefetch={false} className={LINK_CLASS}>
            {t("review.backToQueue")}
          </Link>
        </div>
      );
    case "error":
      return (
        <div className="space-y-3">
          <Alert tone="error">
            <p>{t("review.loadFailed")}</p>
          </Alert>
          <Button variant="secondary" onClick={retry}>
            {t("review.retry")}
          </Button>
        </div>
      );
  }
}
