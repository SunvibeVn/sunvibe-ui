"use client";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { type CoverageRow, isEditingHolder, type MediaPanelModel } from "../../lib/checklist/media-panel-model";
import { mediaErrorText } from "../../lib/checklist/media-messages";

import { useChecklistPage } from "./checklist-context";
import { type MediaController, useChecklistMedia } from "./media-context";
import { PhotoGrid, type PhotoGridMode } from "./photo-grid";
import { PhotoRemovedList } from "./photo-removed-list";
import { PhotoUploadForm } from "./photo-upload-form";
import { PhotoUploadRows } from "./photo-upload-row";
import { usePairText } from "./use-pair-text";

/** G7 in the Edit tab (survey-media spec 6.2): the Photos panel, or the W16 placeholder when photos are not available. */
export function PhotosPanel() {
  const t = useTranslations("OwnerLeads");
  return (
    <section
      id="cl-group-evidence"
      aria-labelledby="cl-group-evidence-title"
      className="scroll-mt-32 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:scroll-mt-20 sm:p-6"
    >
      <h2 id="cl-group-evidence-title" className="text-base font-semibold text-slate-900">
        {t("checklist.panel.groupTitle", { no: 7, name: t("checklist.groups.EVIDENCE") })}
      </h2>
      <div id="cl-evidence" className="mt-2">
        <PhotosBody mode="edit" />
      </div>
    </section>
  );
}

function CoverageList({ title, rows, optional }: { title: string; rows: readonly CoverageRow[]; optional?: boolean }) {
  const t = useTranslations("OwnerLeads");
  const pair = usePairText();
  if (rows.length === 0 && optional) return null;
  const stateText = (row: CoverageRow): string => {
    if (optional) return t("checklist.media.optional.count", { count: row.readyCount });
    switch (row.state) {
      case "COVERED":
        return t("checklist.media.required.COVERED", { count: row.readyCount });
      case "NOT_REQUIRED":
        return t("checklist.media.required.NOT_REQUIRED", { reason: row.notRequiredReason ?? "" });
      case "PROCESSING":
        return t("checklist.media.required.PROCESSING");
      default:
        return t("checklist.media.required.MISSING");
    }
  };
  const tone = (row: CoverageRow) =>
    optional || row.state === "NOT_REQUIRED"
      ? "text-slate-600"
      : row.state === "COVERED"
        ? "text-emerald-700"
        : row.state === "PROCESSING"
          ? "text-violet-700"
          : "text-amber-800";
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">{t("checklist.media.required.none")}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map((row) => (
            <li key={`${row.spaceId ?? "asset"}-${row.category}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
              <span className="min-w-0 break-words text-slate-800">{pair(row.spaceCode, row.category)}</span>
              <span className={`break-words font-medium ${tone(row)}`}>{stateText(row)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UploadArea({ media, model }: { media: MediaController; model: MediaPanelModel }) {
  const t = useTranslations("OwnerLeads");
  const { view, userId } = useChecklistPage();
  const holder = isEditingHolder(view, userId);
  if (!holder) return null;
  const hold = media.hold;
  return (
    <div className="space-y-3">
      {model.canUpload ? (
        <PhotoUploadForm model={model} />
      ) : (
        <Alert tone="info">{t(model.intakePaused ? "checklist.media.errors.intakePaused" : "checklist.media.errors.uploadDisabled")}</Alert>
      )}
      {hold !== null && (
        <div aria-live="polite">
          <Alert tone="info">
            {t(hold.kind === "expensive" ? "checklist.media.errors.rateExpensive" : "checklist.media.errors.intakePaused")}
          </Alert>
        </div>
      )}
      <PhotoUploadRows />
    </div>
  );
}

/**
 * The photos of the checklist (survey-media spec 6.2): the internal-only text and the guidance always; required pairs
 * with their state, optional ones apart; the uploader for the holder of an editable checklist; the grid by placement
 * and category; the photos not accepted and the removed ones. `mode`: the Edit panel, the read-only Edit (grid and
 * viewer, Hold for ADMIN) or the Preview section (grid and viewer only).
 */
export function PhotosBody({ mode }: { mode: PhotoGridMode }) {
  const t = useTranslations("OwnerLeads");
  const media = useChecklistMedia();
  if (media === null) return <p className="text-sm text-slate-600">{t("checklist.evidence.text")}</p>;
  const { model, loadError } = media;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-900">{t("checklist.media.notices.internalOnly")}</p>
        <p className="text-sm text-slate-600">{t("checklist.media.notices.noPeople")}</p>
        <p className="text-sm text-slate-600">{t("checklist.media.notices.thisVisitOnly")}</p>
      </div>
      {model === null ? (
        loadError !== null ? (
          <div className="space-y-2">
            <Alert tone="error">
              <p>{mediaErrorText(loadError, t) ?? t("checklist.media.loadFailed")}</p>
              {loadError.correlationId !== undefined && (
                <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: loadError.correlationId })}</p>
              )}
            </Alert>
            <Button variant="secondary" onClick={media.reloadList}>
              {t("checklist.media.retry")}
            </Button>
          </div>
        ) : (
          <div role="status" aria-busy="true" className="space-y-2">
            <span className="sr-only">{t("checklist.media.loading")}</span>
            <div aria-hidden className="h-20 animate-pulse rounded-lg bg-slate-100" />
          </div>
        )
      ) : (
        <>
          {!model.servingEnabled && <Alert tone="info">{t("checklist.media.errors.servingDisabled")}</Alert>}
          <CoverageList title={t("checklist.media.required.title")} rows={model.required} />
          <CoverageList title={t("checklist.media.optional.title")} rows={model.optional} optional />
          {mode === "edit" && <UploadArea media={media} model={model} />}
          <PhotoGrid model={model} mode={mode} />
          <PhotoRemovedList model={model} />
        </>
      )}
    </div>
  );
}
