"use client";

import { createContext, useContext } from "react";

import type { MediaHoldReason, MediaItem, MediaList, MediaRemovalInput, MediaUiError, MediaVariant } from "@/features/surveys";

import type { DownloadResult, ImageEntry } from "../../lib/checklist/media-object-urls";
import type { MediaPanelModel } from "../../lib/checklist/media-panel-model";
import type { QueueHold, UploadPlacement, UploadRow } from "../../lib/checklist/media-upload-queue";

/** What a photo command gave the part that sent it; page-level outcomes (404, read-only) are handled already. */
export type MediaCommandOutcome = { kind: "done" } | { kind: "failed"; error: MediaUiError };

/** The photos of the checklist on screen (survey-media spec 6.2). Exists only while `media.available` is true. */
export type MediaController = {
  list: MediaList | null;
  model: MediaPanelModel | null;
  /** The first list read failed (nothing shown yet). */
  loadError: MediaUiError | null;
  /** The uploader's rows and the queue's hold. */
  rows: readonly UploadRow[];
  hold: QueueHold | null;
  /** A file is still on its way (the leave guard asks first). */
  uploading: boolean;
  addFiles(files: readonly Blob[], placement: UploadPlacement): void;
  uploadAgain(rowId: string): void;
  /** "Try again": the same photo's bytes again, for a row whose record still awaits content. */
  tryAgain(rowId: string): void;
  cancelRow(rowId: string): void;
  /** The list's photo with this id, in any of its three lists. */
  itemOf(mediaId: string): MediaItem | null;
  remove(mediaId: string, correction: MediaRemovalInput["correction"]): Promise<MediaCommandOutcome>;
  /** ADMIN security hold and its release (A-23), on any checklist state. */
  holdPhoto(mediaId: string, reason: MediaHoldReason): Promise<MediaCommandOutcome>;
  releasePhoto(mediaId: string): Promise<MediaCommandOutcome>;
  reloadList(): void;
  /** The image of a variant in page memory (an object URL), if read; `requestImage` reads it (A-24, A-25). */
  image(mediaId: string, variant: MediaVariant): ImageEntry | undefined;
  /** Grows when image reads may start again (after a 403, 404 or pagehide, once a list read confirmed access). */
  imageEpoch: number;
  /** Stable across renders. */
  requestImage(mediaId: string, variant: MediaVariant): void;
  /** Reads the full file for a download; `releaseDownload` revokes its URL once the browser took it. */
  download(mediaId: string): Promise<DownloadResult>;
  releaseDownload(url: string): void;
};

const MediaContext = createContext<MediaController | null>(null);

export const MediaProvider = MediaContext.Provider;

/** The photos controller, or null when photos are not available on this checklist (A-1). */
export function useChecklistMedia(): MediaController | null {
  return useContext(MediaContext);
}
