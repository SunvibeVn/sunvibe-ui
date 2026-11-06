"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { mediaErrorText } from "../../lib/checklist/media-messages";
import { type EvidenceRow, type PhotoMark, REJECTION_REASON_MAX } from "../../lib/checklist/review-model";
import { photoTitle } from "../../lib/checklist/status-model";
import type { SurveyProblem } from "../../../surveys/schemas/survey/survey-text";
import { problemText } from "../survey/survey-copy";
import { SurveyTextField } from "../survey/survey-text-field";

import { useChecklistMedia } from "./media-context";
import { PhotoThumb } from "./photo-thumb";
import { PhotoViewer } from "./photo-viewer";
import { usePairText } from "./use-pair-text";

const NO_MARK: PhotoMark = { rejected: false, reason: "" };

type RowProps = {
  row: EvidenceRow;
  mark: PhotoMark;
  problem: SurveyProblem | undefined;
  disabled: boolean;
  onMark(mark: PhotoMark): void;
  onOpen(): void;
};

function Row({ row, mark, problem, disabled, onMark, onOpen }: RowProps) {
  const t = useTranslations("OwnerLeads");
  const pair = usePairText();
  const reasonId = useId();
  // The number tells two photos of one pair apart, here and in the decision the Sale reads.
  const title = photoTitle(row.card, pair(row.spaceCode, row.category), t);
  return (
    <li className="space-y-2 rounded-lg border border-slate-200 bg-white p-2 text-sm">
      {row.state === "view" && row.card !== null ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={t("checklist.media.grid.open", { no: row.card.mediaNo })}
          className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          <PhotoThumb mediaId={row.mediaId} mediaNo={row.card.mediaNo} show />
        </button>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-slate-100 p-2 text-center text-xs text-slate-500">
          {t(row.state === "held" ? "checklist.review.evidence.held" : "checklist.media.grid.noImage")}
        </div>
      )}
      <p className="break-words font-medium text-slate-900">{title}</p>
      <label className="flex min-h-9 items-center gap-2 text-slate-800">
        <input
          type="checkbox"
          className="h-4 w-4 accent-violet-600"
          checked={mark.rejected}
          disabled={disabled}
          aria-label={`${t("checklist.review.evidence.notAccepted")}: ${title}`}
          onChange={(event) => onMark({ ...mark, rejected: event.target.checked })}
        />
        {t("checklist.review.evidence.notAccepted")}
      </label>
      {mark.rejected && (
        <fieldset disabled={disabled}>
          <SurveyTextField
            id={reasonId}
            label={t("checklist.review.evidence.reason")}
            required
            rows={2}
            value={mark.reason}
            onChange={(reason) => onMark({ ...mark, reason })}
            error={problem === undefined ? undefined : problemText(t, problem, "text", REJECTION_REASON_MAX)}
          />
        </fieldset>
      )}
    </li>
  );
}

type EvidenceReviewListProps = {
  rows: readonly EvidenceRow[];
  marks: Readonly<Record<string, PhotoMark>>;
  /** Shown once the reviewer tried to send: the first problem per photo. */
  problems: Readonly<Record<string, SurveyProblem>>;
  disabled: boolean;
  onMark(mediaId: string, mark: PhotoMark): void;
};

/**
 * The frozen photos with "Not accepted" and a reason per photo (survey-checklist submission spec 6.1, A-5): every photo
 * left unmarked counts as accepted. An ADMIN can still hold a photo from the viewer.
 */
export function EvidenceReviewList({ rows, marks, problems, disabled, onMark }: EvidenceReviewListProps) {
  const t = useTranslations("OwnerLeads");
  const media = useChecklistMedia();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = rows.find((row) => row.mediaId === viewingId && row.state === "view") ?? null;
  // The photo was held meanwhile: the viewer closes for good, as in the grid.
  if (viewingId !== null && viewing === null) setViewingId(null);
  const loading = media !== null && media.model === null && media.loadError === null;
  const loadError = media?.loadError ?? null;

  let body;
  if (rows.length === 0) body = <p className="text-sm text-slate-600">{t("checklist.review.evidence.empty")}</p>;
  else if (loading) {
    body = (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t("checklist.media.loading")}</span>
        <div aria-hidden className="h-20 animate-pulse rounded-lg bg-slate-100" />
      </div>
    );
  } else {
    body = (
      <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <Row
            key={row.mediaId}
            row={row}
            mark={Object.hasOwn(marks, row.mediaId) ? marks[row.mediaId] : NO_MARK}
            problem={Object.hasOwn(problems, row.mediaId) ? problems[row.mediaId] : undefined}
            disabled={disabled}
            onMark={(mark) => onMark(row.mediaId, mark)}
            onOpen={() => setViewingId(row.mediaId)}
          />
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="cl-evidence-review-title" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id="cl-evidence-review-title" className="text-base font-semibold text-slate-900">
        {t("checklist.review.evidence.title")}
      </h2>
      {loadError !== null && media !== null && media.model === null && (
        <div className="space-y-2">
          <Alert tone="error">{mediaErrorText(loadError, t) ?? t("checklist.review.evidence.loadFailed")}</Alert>
          <Button variant="secondary" onClick={media.reloadList}>
            {t("checklist.media.retry")}
          </Button>
        </div>
      )}
      {body}
      {viewing !== null && viewing.card !== null && (
        <PhotoViewer photo={viewing.card} spaceCode={viewing.spaceCode} holdControls onClose={() => setViewingId(null)} />
      )}
    </section>
  );
}
