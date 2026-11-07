"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { megabytes } from "../../lib/checklist/media-form";
import { mediaErrorText } from "../../lib/checklist/media-messages";
import { uploadRowStatus } from "../../lib/checklist/media-panel-model";
import type { UploadRow } from "../../lib/checklist/media-upload-queue";

import { useChecklistPage } from "./checklist-context";
import { useChecklistMedia } from "./media-context";
import { PhotoThumb } from "./photo-thumb";
import { usePairText } from "./use-pair-text";

const ACTION = "px-3 py-1";

function Row({ row }: { row: UploadRow }) {
  const t = useTranslations("OwnerLeads");
  const media = useChecklistMedia();
  const { view } = useChecklistPage();
  const pair = usePairText();
  if (media === null) return null;
  const spaceCode =
    row.placement.spaceId === null
      ? null
      : ((view.groups?.identification?.content?.spaces ?? []).find((space) => space.spaceId === row.placement.spaceId)?.code ?? null);
  const item = row.mediaId === null ? null : media.itemOf(row.mediaId);
  const shown = uploadRowStatus(row, item);
  // The record still waits for these bytes: send them again; a new photo would be refused as a duplicate (A-16).
  const awaiting = item?.status === "AWAITING_CONTENT" || item?.status === "RECEIVING";
  const percent = row.progress && row.progress.total > 0 ? Math.min(100, Math.round((row.progress.sent / row.progress.total) * 100)) : 0;
  const finished = ["ready", "notAccepted", "removed", "failed", "stopped"].includes(shown.state);
  const errorText = row.error === null ? null : mediaErrorText(row.error, t, { maxFileBytes: media.list?.limits?.maxFileBytes ?? null });
  const tone =
    shown.state === "ready"
      ? "text-emerald-700"
      : shown.state === "failed" || shown.state === "notAccepted" || shown.state === "stopped"
        ? "text-rose-700"
        : "text-slate-700";
  const match = row.error?.matchingMediaId ?? null;
  const stateWord = t(`checklist.media.rows.${shown.state}` as "checklist.media.rows.ready", { percent });

  return (
    <li className="space-y-1.5 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="min-w-0 break-words text-slate-800">
          {t("checklist.media.rows.label", { pair: pair(spaceCode, row.placement.category), size: megabytes(row.sizeBytes) })}
        </span>
        <span aria-hidden className={`font-medium ${tone}`}>
          {stateWord}
        </span>
        {/* Announced once per state, never per percent (the progress bar carries the value). */}
        <span aria-live="polite" className="sr-only">
          {shown.state === "uploading" ? t("checklist.media.rows.uploadingState") : stateWord}
        </span>
      </div>
      {shown.state === "uploading" && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t("checklist.media.rows.uploading", { percent })}
          className="h-1.5 overflow-hidden rounded-full bg-slate-200"
        >
          <div className="h-full bg-violet-600 transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      )}
      {shown.reason !== null && <p className="break-words text-rose-700">{t(`checklist.media.reasons.${shown.reason}`)}</p>}
      {errorText !== null && shown.state !== "ready" && <p className="break-words text-rose-700">{errorText}</p>}
      {row.giveUp && <p className="text-rose-700">{t("checklist.media.rows.tryLater")}</p>}
      {match !== null && row.error?.kind === "other-visit" && (
        // The matching photo of the other visit: its thumbnail only, no link to the other checklist (spec 6.2).
        <div className="h-24 w-32 overflow-hidden rounded-md bg-slate-100">
          <PhotoThumb mediaId={match} mediaNo={0} show otherVisit alt={t("checklist.media.rows.matchThumb")} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {match !== null && row.error?.kind === "duplicate" && (
          <a href={`#photo-${match}`} className="rounded-full px-3 py-1 text-sm font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
            {t("checklist.media.rows.showMatch")}
          </a>
        )}
        {(shown.state === "failed" || shown.state === "stopped") && awaiting ? (
          <Button variant="secondary" className={ACTION} onClick={() => media.tryAgain(row.id)}>
            {t("checklist.media.rows.tryAgain")}
          </Button>
        ) : (
          (shown.state === "failed" || shown.state === "notAccepted" || shown.state === "stopped") && (
            <Button variant="secondary" className={ACTION} onClick={() => media.uploadAgain(row.id)}>
              {t("checklist.media.rows.uploadAgain")}
            </Button>
          )
        )}
        <Button variant="ghost" className={ACTION} onClick={() => media.cancelRow(row.id)}>
          {finished || shown.state === "processing" ? t("checklist.media.rows.dismiss") : t("checklist.media.rows.cancel")}
        </Button>
      </div>
    </li>
  );
}

/** The uploader's rows (SM-27): each file with its own state and reason; a failed file never stops the others. */
export function PhotoUploadRows() {
  const t = useTranslations("OwnerLeads");
  const media = useChecklistMedia();
  if (media === null || media.rows.length === 0) return null;
  return (
    <section aria-labelledby="photo-uploads-title" className="space-y-2">
      <h3 id="photo-uploads-title" className="text-sm font-semibold text-slate-900">
        {t("checklist.media.rows.title")}
      </h3>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {media.rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </ul>
    </section>
  );
}
