"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import { mediaErrorText } from "../../lib/checklist/media-messages";
import type { PhotoCard } from "../../lib/checklist/media-panel-model";

import type { MediaUiError } from "../../lib/media-ui-error";
import { useChecklistPage } from "./checklist-context";
import { useChecklistMedia } from "./media-context";
import { PhotoHoldControls } from "./photo-hold-controls";
import { PhotoThumb } from "./photo-thumb";
import { usePairText } from "./use-pair-text";

/** How long a download's object URL lives after the browser was handed it. */
const DOWNLOAD_URL_MS = 10_000;

type PhotoViewerProps = {
  photo: PhotoCard;
  spaceCode: string | null;
  /** Hold and Release for an ADMIN (`canHold`), not in the Preview tab. */
  holdControls?: boolean;
  /** Remove (the holder of an editable checklist only): closes the viewer and asks first. */
  onRemove?: (photo: PhotoCard) => void;
  onClose(): void;
};

/**
 * The viewer of one photo (survey-media spec 6.2): the PREVIEW from page memory and Download of the FULL file under the
 * UI's own file name (never a new tab, never `next/image`).
 */
export function PhotoViewer({ photo, spaceCode, holdControls = false, onRemove, onClose }: PhotoViewerProps) {
  const t = useTranslations("OwnerLeads");
  const media = useChecklistMedia();
  const { view } = useChecklistPage();
  const pair = usePairText();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<MediaUiError | null>(null);

  const download = async () => {
    if (media === null || downloading) return;
    setDownloading(true);
    setError(null);
    const result = await media.download(photo.id);
    setDownloading(false);
    if (!result.ok) {
      if (result.error.kind !== "aborted") setError(result.error);
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = result.url;
    anchor.download = `sunvibe-checklist-${view.checklistNo ?? 0}-photo-${photo.mediaNo}.jpg`;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    const url = result.url;
    setTimeout(() => media.releaseDownload(url), DOWNLOAD_URL_MS);
  };

  const errorText = error === null ? null : mediaErrorText(error, t);
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("checklist.media.viewer.title", { no: photo.mediaNo, pair: pair(spaceCode, photo.category) })}
      closeLabel={t("checklist.media.viewer.close")}
      footer={
        <>
          {onRemove !== undefined && photo.canRemove && (
            <Button variant="ghost" onClick={() => onRemove(photo)}>
              {t(photo.carriedFromChecklistNo === null ? "checklist.media.grid.remove" : "checklist.media.carried.remove")}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t("checklist.media.viewer.close")}
          </Button>
          <Button pending={downloading} disabled={!photo.canView} onClick={() => void download()}>
            {downloading ? t("checklist.media.viewer.downloading") : t("checklist.media.viewer.download")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-slate-100">
          <PhotoThumb mediaId={photo.id} mediaNo={photo.mediaNo} show={photo.canView} variant="preview" />
        </div>
        {errorText !== null && (
          <div aria-live="polite">
            <Alert tone="error">{errorText}</Alert>
          </div>
        )}
        {photo.caption !== null && <p className="whitespace-pre-wrap break-words text-slate-800">{photo.caption}</p>}
        {holdControls && <PhotoHoldControls photo={photo} />}
        <p className="break-words text-xs text-slate-500">
          {t("checklist.media.grid.uploadedBy", { name: photo.uploadedByName ?? t("checklist.media.grid.unknownName") })}
          {photo.uploadedAs !== null && ` · ${t("checklist.media.grid.uploadedAs", { code: photo.uploadedAs })}`}
        </p>
      </div>
    </Dialog>
  );
}
