"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ChecklistUiError,
  createMedia,
  getMediaImage,
  holdMedia,
  type MediaHoldReason,
  knownVersionOf,
  listMedia,
  type MediaItem,
  type MediaList,
  type MediaRemovalInput,
  type MediaUiError,
  type MediaVariant,
  releaseMediaHold,
  removeMedia,
  sha256OfBlob,
  toMediaUiError,
  uploadMediaContent,
} from "@/features/surveys";

import { newClientId } from "../../lib/checklist/client-id";
import { attachPageEvents, createObjectUrlStore, type ObjectUrlStore } from "../../lib/checklist/media-object-urls";
import { listDecision } from "../../lib/checklist/media-ordering";
import { mediaPanelModel } from "../../lib/checklist/media-panel-model";
import { createMediaPoller, type MediaPoller, type PollResult } from "../../lib/checklist/media-polling";
import {
  createUploadQueue,
  type QueueHold,
  type UploadPlacement,
  type UploadQueue,
  type UploadRow,
} from "../../lib/checklist/media-upload-queue";

import type { ChecklistController } from "./checklist-context";
import type { MediaCommandOutcome, MediaController } from "./media-context";

/** The photo refusals the checklist page answers itself (404 leaves, 403 and read-only reload), as its own kinds. */
const PAGE_KINDS: ReadonlySet<MediaUiError["kind"]> = new Set([
  "not-found",
  "forbidden",
  "read-only",
  "takeover-required",
  "surveyor-ineligible",
  "signed-out",
  "unavailable",
]);

function pageErrorOf(error: MediaUiError): ChecklistUiError | null {
  if (!PAGE_KINDS.has(error.kind)) return null;
  return { kind: error.kind as ChecklistUiError["kind"], ...(error.correlationId === undefined ? {} : { correlationId: error.correlationId }) };
}

const PENDING = new Set(["AWAITING_CONTENT", "RECEIVING", "PROCESSING"]);
/** Queue states of a file still on its way (the leave guard and the poll rate follow them). */
const QUEUE_BUSY = new Set(["waiting", "hashing", "creating", "uploading", "checking", "retrying", "queued"]);
const hasPending = (list: MediaList | null): boolean => (list?.items ?? []).some((item) => PENDING.has(item.status ?? ""));

/** The list on screen is older than the checklist read (a save or takeover changed what it counts). */
function listBehind(list: MediaList, view: ChecklistController["view"]): boolean {
  const basis = list.basis;
  return (
    (view.media?.setVersion ?? -1) > (list.setVersion ?? -1) ||
    (view.groups?.identification?.version ?? -1) > (basis?.identificationVersion ?? -1) ||
    (view.groups?.condition?.version ?? -1) > (basis?.conditionVersion ?? -1) ||
    (view.version ?? -1) > (basis?.checklistVersion ?? -1)
  );
}

/**
 * The photos of the checklist page (survey-media spec 6.2): the list read in the browser and polled by its rules,
 * applied only when it is not older than the screen (asking for a checklist read when it is newer), the uploader
 * queue, and the removal. A 404 or 403 of the list goes to the page like the W16 checklist calls.
 */
export function useMedia(page: ChecklistController): MediaController {
  const { checklistId, view, userId } = page;
  const [list, setList] = useState<MediaList | null>(null);
  const [loadError, setLoadError] = useState<MediaUiError | null>(null);
  const listRef = useRef<MediaList | null>(null);
  const viewRef = useRef(view);
  const pageRef = useRef(page);
  const pollerRef = useRef<MediaPoller | null>(null);
  const imagesRef = useRef<ObjectUrlStore | null>(null);
  const [imagesVersion, setImagesVersion] = useState(0);
  const [imageEpoch, setImageEpoch] = useState(0);
  const live = useRef(false);

  useEffect(() => {
    viewRef.current = view;
    pageRef.current = page;
  });

  const failPage = useCallback((error: MediaUiError): boolean => {
    const pageError = pageErrorOf(error);
    if (pageError === null) return false;
    void pageRef.current.fail(pageError);
    return true;
  }, []);

  const readList = useCallback(async (): Promise<PollResult> => {
    const known = listRef.current === null ? null : knownVersionOf(listRef.current);
    const result = await listMedia(checklistId, known);
    if (!live.current) return { kind: "failed" };
    if (result.ok) {
      if (result.data === null) {
        // 204: unchanged, and the viewer still sees the lead (reads may start again after a 403 or pagehide).
        imagesRef.current?.confirmAccess();
        return { kind: "unchanged" };
      }
      const decision = listDecision({ view: viewRef.current, list: listRef.current }, result.data);
      if (decision.apply) {
        listRef.current = result.data;
        // Serving off, or a photo no longer servable: its object URLs go before the list shows (spec 6.2).
        imagesRef.current?.applyList(result.data);
        setList(result.data);
        setLoadError(null);
      }
      if (decision.rereadChecklist) void pageRef.current.reload();
      return { kind: decision.apply ? "applied" : "unchanged" };
    }
    const error = toMediaUiError(result, "list") ?? { kind: "retry" as const };
    // A 429 keeps the list on screen and waits for its Retry-After (spec 6.2).
    if (result.kind === "http" && result.status === 429) return { kind: "rate-limited", retryAfterSeconds: error.retryAfterSeconds };
    if (error.kind === "not-found" || error.kind === "forbidden") imagesRef.current?.revokeAll({ block: true });
    if (failPage(error)) return { kind: "failed" };
    if (listRef.current === null) setLoadError(error);
    return { kind: "failed" };
  }, [checklistId, failPage]);

  const queueRef = useRef<UploadQueue | null>(null);
  const [rows, setRows] = useState<readonly UploadRow[]>([]);
  const [hold, setHold] = useState<QueueHold | null>(null);

  // The uploader queue and the poller live while the panel is mounted; the poller reads at once, then by the rules
  // of spec 6.2. Leaving the page (or another user) stops every running upload; nothing is kept.
  useEffect(() => {
    live.current = true;
    const queue = createUploadQueue({
      checklistId,
      hash: (file) => sha256OfBlob(file),
      create: (id, input) => createMedia(id, input),
      upload: (input) => uploadMediaContent(input),
      readList: async () => {
        await readList();
        return listRef.current;
      },
      onPageFailure: (error) => {
        failPage(error);
      },
      onAnswer: () => pollerRef.current?.refresh(),
      discard: (mediaId) => {
        // Only a record that still has no bytes is given back (a free removal of the holder's own photo, spec 4.7).
        const all = [...(listRef.current?.items ?? []), ...(listRef.current?.notAcceptedItems ?? [])];
        const status = all.find((item) => item.id === mediaId)?.status;
        if (status !== undefined && status !== "AWAITING_CONTENT" && status !== "RECEIVING") return;
        void removeMedia(mediaId, { correction: null }).then(() => pollerRef.current?.readNow());
      },
      maxFileBytes: () => listRef.current?.limits?.maxFileBytes ?? null,
      newUploadKey: () => newClientId(),
      now: () => Date.now(),
      onChange: () => {
        setRows(queue.rows());
        setHold(queue.hold());
      },
    });
    queueRef.current = queue;
    const images = createObjectUrlStore({
      read: (mediaId, variant, download) => getMediaImage(mediaId, variant, { download }),
      createObjectURL: (blob) => URL.createObjectURL(blob),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
      onPageFailure: (error) => {
        failPage(error);
      },
      now: () => Date.now(),
      onChange: () => {
        setImagesVersion((version) => version + 1);
        setImageEpoch(images.epoch());
      },
      onServingOff: () => pollerRef.current?.readNow(),
    });
    imagesRef.current = images;
    const detachImages = attachPageEvents(window, document, images);
    const poller = createMediaPoller({
      read: readList,
      isPending: () => queue.running() || hasPending(listRef.current),
      isVisible: () => document.visibilityState === "visible",
      now: () => Date.now(),
    });
    pollerRef.current = poller;
    poller.start();
    poller.readNow();
    const onVisibility = () => poller.onVisibilityChange();
    const onPageShow = (event: PageTransitionEvent) => poller.onPageShow(event.persisted);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      live.current = false;
      poller.stop();
      pollerRef.current = null;
      queueRef.current = null;
      imagesRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      detachImages();
      queue.dispose();
      // Route leave, sign-out or user change (the scope remounts): every object URL is revoked.
      images.dispose();
    };
  }, [checklistId, readList, failPage]);

  // A newer checklist read (a save, a takeover, a cascade) changes what the list counts: read it again.
  useEffect(() => {
    if (list !== null && listBehind(list, view)) pollerRef.current?.readNow();
  }, [list, view]);

  // A 403 or 404 of a checklist call (the lead was reassigned, the checklist is hidden): no image stays (SM-28).
  const { accessLost } = page;
  // Reads stay off until the next list read confirms access, so a 403 never loops (review M-1).
  useEffect(() => {
    if (accessLost > 0) imagesRef.current?.revokeAll({ block: true });
  }, [accessLost]);

  // A row that started or ended changes the poll rate; progress events do not (they would postpone the poll).
  const queueBusy = rows.some((row) => QUEUE_BUSY.has(row.state));
  useEffect(() => {
    pollerRef.current?.refresh();
  }, [queueBusy]);

  const itemOf = useCallback(
    (mediaId: string): MediaItem | null =>
      [...(list?.items ?? []), ...(list?.notAcceptedItems ?? []), ...(list?.removedItems ?? [])].find((item) => item.id === mediaId) ??
      null,
    [list],
  );

  const remove = useCallback(
    async (mediaId: string, correction: MediaRemovalInput["correction"]): Promise<MediaCommandOutcome> => {
      const result = await removeMedia(mediaId, { correction });
      if (result.ok) {
        pollerRef.current?.readNow();
        return { kind: "done" };
      }
      const error = toMediaUiError(result, "remove") ?? { kind: "retry" as const };
      failPage(error);
      if (error.kind === "stale") pollerRef.current?.readNow();
      return { kind: "failed", error };
    },
    [failPage],
  );

  /** A hold or release answer: the list is read again; a refusal is the page's or the caller's (A-23). */
  const holdCommand = useCallback(
    async (send: () => ReturnType<typeof holdMedia>): Promise<MediaCommandOutcome> => {
      const result = await send();
      if (result.ok) {
        pollerRef.current?.readNow();
        return { kind: "done" };
      }
      const error = toMediaUiError(result, "hold") ?? { kind: "retry" as const };
      failPage(error);
      return { kind: "failed", error };
    },
    [failPage],
  );

  const requestImage = useCallback((mediaId: string, variant: MediaVariant) => imagesRef.current?.request(mediaId, variant), []);

  const model = useMemo(() => (list === null ? null : mediaPanelModel(view, list, userId)), [list, view, userId]);

  return {
    list,
    model,
    loadError,
    rows,
    hold,
    uploading: queueBusy,
    addFiles: (files: readonly Blob[], placement: UploadPlacement) => queueRef.current?.add(files, placement),
    uploadAgain: (rowId: string) => queueRef.current?.againAsNew(rowId),
    tryAgain: (rowId: string) => queueRef.current?.retry(rowId),
    cancelRow: (rowId: string) => queueRef.current?.cancel(rowId),
    itemOf,
    remove,
    reloadList: () => pollerRef.current?.readNow(),
    holdPhoto: (mediaId: string, reason: MediaHoldReason) => holdCommand(() => holdMedia(mediaId, reason)),
    releasePhoto: (mediaId: string) => holdCommand(() => releaseMediaHold(mediaId)),
    // `imagesVersion` changes with every image answer, so the parts that show images render again.
    image: (mediaId: string, variant: MediaVariant) => (imagesVersion >= 0 ? imagesRef.current?.get(mediaId, variant) : undefined),
    imageEpoch,
    requestImage,
    download: (mediaId: string) =>
      imagesRef.current?.download(mediaId) ?? Promise.resolve({ ok: false as const, error: { kind: "aborted" as const } }),
    releaseDownload: (url: string) => imagesRef.current?.releaseDownload(url),
  };
}
