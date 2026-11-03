import type { ApiResult } from "@/features/auth/client";
import {
  type ContentHash,
  contentDigestHeader,
  type MediaCategory,
  type MediaCreated,
  type MediaCreateInput,
  type MediaList,
  type MediaUiError,
  toMediaUiError,
  type UploadInput,
  type UploadResult,
} from "@/features/surveys";

// The uploader queue of the Photos panel (survey-media spec 6.2 Uploader, 6.3; SM-27): each picked file is its own row
// with its own `uploadKey` (a new one for every new photo, never reused), hashed, created, then its bytes sent; up to 3
// at a time. A failed file fails alone. Some refusals wait instead of failing: MEDIA_LIMIT_REACHED `pending` and 429
// `bodies` queue the file, a busy server retries later, 429 `expensive` holds the whole queue for the hour, 503
// MEDIA_INTAKE_PAUSED holds it, reads the list and retries. A read-only or takeover-required checklist stops the queue
// and the page reads the checklist again. A network error on the content PUT is "state unknown": the list says whether
// the bytes arrived; only a photo still awaiting content is sent again, after 5, 15 and 45 s, then "Try again later".

export const MAX_PARALLEL_UPLOADS = 3;
/** The waits before sending again after a state-unknown answer (spec 6.2). */
export const UNKNOWN_BACKOFF_MS = [5_000, 15_000, 45_000] as const;
const PENDING_RETRY_MS = 15_000;
const BODIES_RETRY_MS = 5_000;
const BUSY_RETRY_MS = 15_000;
const PAUSED_RETRY_MS = 60_000;
const EXPENSIVE_HOLD_MS = 3_600_000;

export type UploadPlacement = { spaceId: string | null; category: MediaCategory; caption: string | null };

export type UploadRowState =
  /** Waiting for a free place in the queue. */
  | "waiting"
  | "hashing"
  | "creating"
  | "uploading"
  /** State unknown: the list is being read to learn whether the bytes arrived. */
  | "checking"
  /** Waiting before it is sent again after a state-unknown answer. */
  | "retrying"
  /** Waiting for the server: pending limit, busy body slots or store. */
  | "queued"
  /** The server has the bytes; the list says how it ends (never shown ready before the server says READY). */
  | "processing"
  | "failed"
  /** The queue stopped (read-only, takeover required, the checklist gone or the session ended). */
  | "stopped";

export type UploadRow = {
  id: string;
  placement: UploadPlacement;
  sizeBytes: number;
  uploadKey: string;
  mediaId: string | null;
  state: UploadRowState;
  progress: { sent: number; total: number } | null;
  error: MediaUiError | null;
  /** After the last state-unknown wait: "Try again later". */
  giveUp: boolean;
};

export type QueueHold = { kind: "expensive" | "intake-paused"; until: number };

export type UploadQueueDeps = {
  checklistId: string;
  hash(file: Blob): Promise<ContentHash>;
  create(checklistId: string, input: MediaCreateInput): Promise<ApiResult<MediaCreated>>;
  upload(input: UploadInput): Promise<UploadResult>;
  /** Reads the photo list again (the page applies it by its ordering rule) and answers the list then on screen. */
  readList(): Promise<MediaList | null>;
  /** A refusal the page answers itself: read-only and takeover required re-read the checklist, 404 leaves. */
  onPageFailure(error: MediaUiError): void;
  /** A create or upload answered with this set version: the page reads the list soon. */
  onAnswer(setVersion: number | undefined): void;
  /**
   * The user cancelled a row whose photo record exists (or whose create answered after the cancel): the page removes
   * the record if it still awaits content, so it neither holds a place nor refuses the same file as a duplicate (A-16).
   */
  discard(mediaId: string): void;
  /** The largest file the server takes (`limits.maxFileBytes` of the list), or null while unknown. */
  maxFileBytes(): number | null;
  newUploadKey(): string;
  now(): number;
  onChange(): void;
};

type Row = UploadRow & {
  file: Blob;
  hash: ContentHash | null;
  controller: AbortController | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  unknownAttempts: number;
  /** Cancelled by the user: a create answering later gives its record back. */
  cancelled: boolean;
};

const ACTIVE: ReadonlySet<UploadRowState> = new Set(["hashing", "creating", "uploading", "checking"]);
const RUNNING: ReadonlySet<UploadRowState> = new Set(["waiting", "hashing", "creating", "uploading", "checking", "retrying", "queued"]);
/** Refusals that stop the whole queue and go to the page. */
const STOPS: ReadonlySet<MediaUiError["kind"]> = new Set([
  "read-only",
  "takeover-required",
  "not-found",
  "forbidden",
  "signed-out",
  "unavailable",
  "surveyor-ineligible",
]);

const secondsOr = (error: MediaUiError, fallbackMs: number): number =>
  error.retryAfterSeconds !== undefined && error.retryAfterSeconds > 0 ? error.retryAfterSeconds * 1000 : fallbackMs;

export function createUploadQueue(deps: UploadQueueDeps) {
  let rows: Row[] = [];
  let snapshot: readonly UploadRow[] = [];
  let holdState: QueueHold | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let isStopped = false;
  let disposed = false;
  let nextId = 0;

  const publish = () => {
    snapshot = rows.map(({ id, placement, sizeBytes, uploadKey, mediaId, state, progress, error, giveUp }) => ({
      id,
      placement,
      sizeBytes,
      uploadKey,
      mediaId,
      state,
      progress,
      error,
      giveUp,
    }));
    deps.onChange();
  };

  const alive = (row: Row, state: UploadRowState): boolean => !disposed && rows.includes(row) && row.state === state;

  const set = (row: Row, patch: Partial<Row>) => {
    Object.assign(row, patch);
    publish();
  };

  function wait(row: Row, state: "queued" | "retrying", ms: number, error: MediaUiError | null) {
    clearTimeout(row.timer);
    set(row, { state, error, progress: null, controller: null });
    row.timer = setTimeout(() => {
      if (!alive(row, state)) return;
      set(row, { state: "waiting" });
      pump();
    }, ms);
  }

  function holdQueue(kind: QueueHold["kind"], ms: number) {
    const until = deps.now() + ms;
    if (holdState !== null && holdState.until >= until) return;
    holdState = { kind, until };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      holdState = null;
      publish();
      pump();
    }, ms);
    publish();
  }

  function stop(error: MediaUiError) {
    const first = !isStopped;
    isStopped = true;
    for (const row of rows) {
      if (!RUNNING.has(row.state)) continue;
      clearTimeout(row.timer);
      row.controller?.abort();
      Object.assign(row, { state: "stopped", controller: null, progress: null });
    }
    publish();
    if (first) deps.onPageFailure(error);
  }

  function fail(row: Row, error: MediaUiError, giveUp = false) {
    set(row, { state: "failed", error, giveUp, controller: null, progress: null });
  }

  /** Classifies a refusal shared by the create and the upload; true when it handled it. */
  function common(row: Row, error: MediaUiError): boolean {
    if (STOPS.has(error.kind)) {
      stop(error);
      return true;
    }
    switch (error.kind) {
      case "busy":
        wait(row, "queued", secondsOr(error, BUSY_RETRY_MS), error);
        return true;
      case "intake-paused":
        set(row, { state: "waiting", error, progress: null, controller: null });
        holdQueue("intake-paused", secondsOr(error, PAUSED_RETRY_MS));
        void deps.readList();
        return true;
      case "rate-expensive":
        set(row, { state: "waiting", error, progress: null, controller: null });
        holdQueue("expensive", secondsOr(error, EXPENSIVE_HOLD_MS));
        return true;
      default:
        return false;
    }
  }

  /** After a lost connection or an "in progress" answer: the list tells whether the bytes arrived. */
  async function recheck(row: Row) {
    set(row, { state: "checking", progress: null, controller: null });
    let list: MediaList | null = null;
    try {
      list = await deps.readList();
    } catch {
      list = null;
    }
    if (!alive(row, "checking")) return;
    const all = [...(list?.items ?? []), ...(list?.notAcceptedItems ?? []), ...(list?.removedItems ?? [])];
    const item = all.find((entry) => entry.id === row.mediaId);
    const status = list === null ? null : (item?.status ?? "MISSING");
    if (item?.removed || status === "UPLOAD_EXPIRED" || status === "CANCELLED" || status === "MISSING") {
      fail(row, { kind: "upload-again" });
      return;
    }
    if (status === "PROCESSING" || status === "READY" || status === "REJECTED" || status === "FAILED") {
      set(row, { state: "processing", error: null });
      return;
    }
    // Still awaiting content (or receiving, or the list could not be read): send again after the next wait.
    if (row.unknownAttempts >= UNKNOWN_BACKOFF_MS.length) {
      fail(row, { kind: "state-unknown" }, true);
      return;
    }
    const ms = UNKNOWN_BACKOFF_MS[row.unknownAttempts];
    row.unknownAttempts += 1;
    wait(row, "retrying", ms, { kind: "state-unknown" });
  }

  async function send(row: Row) {
    const hash = row.hash;
    const mediaId = row.mediaId;
    if (hash === null || mediaId === null) return;
    const controller = new AbortController();
    set(row, { state: "uploading", controller, progress: { sent: 0, total: row.sizeBytes } });
    const result = await deps.upload({
      mediaId,
      file: row.file,
      contentDigest: contentDigestHeader(hash.base64),
      signal: controller.signal,
      onProgress: (sent, total) => {
        if (alive(row, "uploading")) set(row, { progress: { sent, total } });
      },
    });
    if (!alive(row, "uploading") || row.controller !== controller) return;
    if (result.ok) {
      set(row, { state: "processing", error: null, controller: null, progress: null });
      deps.onAnswer(result.data.setVersion);
      return;
    }
    const error = toMediaUiError(result, "upload") ?? { kind: "retry" as const };
    if (common(row, error)) return;
    switch (error.kind) {
      case "aborted":
        return;
      case "rate-bodies":
        wait(row, "queued", secondsOr(error, BODIES_RETRY_MS), error);
        return;
      case "state-unknown":
      case "in-progress":
      case "already-received":
        await recheck(row);
        return;
      default:
        fail(row, error);
    }
  }

  async function run(row: Row) {
    // A file above the server's own limit is never read whole into memory (a video picked by mistake would crash
    // the tab and its unsaved drafts): it fails here with the server's message.
    const max = deps.maxFileBytes();
    if (row.hash === null && max !== null && row.sizeBytes > max) {
      fail(row, { kind: "too-large" });
      return;
    }
    if (row.hash === null) {
      set(row, { state: "hashing", error: null });
      try {
        row.hash = await deps.hash(row.file);
      } catch {
        if (alive(row, "hashing")) fail(row, { kind: "retry" });
        return;
      }
      if (!alive(row, "hashing")) return;
    }
    if (row.mediaId === null) {
      set(row, { state: "creating", error: null });
      const result = await deps.create(deps.checklistId, {
        uploadKey: row.uploadKey,
        spaceId: row.placement.spaceId,
        category: row.placement.category,
        caption: row.placement.caption,
        sizeBytes: row.sizeBytes,
        contentSha256: row.hash.hex,
      });
      if (!alive(row, "creating")) {
        if (row.cancelled && result.ok && result.data.media?.id) deps.discard(result.data.media.id);
        return;
      }
      if (!result.ok) {
        const error = toMediaUiError(result, "create") ?? { kind: "retry" as const };
        if (common(row, error)) return;
        if (error.kind === "limit-pending") wait(row, "queued", PENDING_RETRY_MS, error);
        else fail(row, error);
        return;
      }
      const media = result.data.media;
      row.mediaId = media?.id ?? null;
      deps.onAnswer(result.data.setVersion);
      if (row.mediaId === null) {
        fail(row, { kind: "retry" });
        return;
      }
      // A replay of a photo whose bytes the server already has: nothing to send.
      if (media?.status !== undefined && media.status !== "AWAITING_CONTENT") {
        set(row, { state: "processing", error: null });
        return;
      }
    }
    await send(row);
  }

  function pump() {
    if (disposed || isStopped || holdState !== null) return;
    let active = rows.filter((row) => ACTIVE.has(row.state)).length;
    for (const row of rows) {
      if (active >= MAX_PARALLEL_UPLOADS) break;
      if (row.state !== "waiting") continue;
      active += 1;
      void run(row).finally(pump);
    }
  }

  function newRow(file: Blob, placement: UploadPlacement): Row {
    nextId += 1;
    return {
      id: `upload-${nextId}`,
      placement,
      sizeBytes: file.size,
      uploadKey: deps.newUploadKey(),
      mediaId: null,
      state: "waiting",
      progress: null,
      error: null,
      giveUp: false,
      file,
      hash: null,
      controller: null,
      timer: undefined,
      unknownAttempts: 0,
      cancelled: false,
    };
  }

  const drop = (row: Row) => {
    clearTimeout(row.timer);
    row.controller?.abort();
    rows = rows.filter((entry) => entry !== row);
  };

  return {
    /** Adds one row per file (a new photo each), placement, category and caption shared. */
    add(files: readonly Blob[], placement: UploadPlacement): void {
      if (disposed || files.length === 0) return;
      isStopped = false;
      rows = [...rows, ...files.map((file) => newRow(file, placement))];
      publish();
      pump();
    },
    rows: (): readonly UploadRow[] => snapshot,
    hold: (): QueueHold | null => holdState,
    stopped: (): boolean => isStopped,
    /** Whether a file is still on its way (the leave guard asks before leaving). */
    running: (): boolean => rows.some((row) => RUNNING.has(row.state)),
    /** "Upload again": the same file as a new photo (a new key); the old row goes. */
    againAsNew(rowId: string): void {
      const row = rows.find((entry) => entry.id === rowId);
      if (row === undefined || disposed) return;
      const index = rows.indexOf(row);
      drop(row);
      rows.splice(index, 0, newRow(row.file, row.placement));
      isStopped = false;
      publish();
      pump();
    },
    /**
     * Takes a row off the uploader: a running upload is aborted, and a record that has no bytes yet is given back
     * (`discard`); a photo the server already has stays in the grid.
     */
    cancel(rowId: string): void {
      const row = rows.find((entry) => entry.id === rowId);
      if (row === undefined) return;
      row.cancelled = true;
      drop(row);
      if (row.mediaId !== null && row.state !== "processing") deps.discard(row.mediaId);
      publish();
      pump();
    },
    /**
     * "Try again": the same photo (same record and bytes) is sent again, its waits reset; for a row whose record still
     * awaits content. A row without a record starts over with its own key.
     */
    retry(rowId: string): void {
      const row = rows.find((entry) => entry.id === rowId);
      if (row === undefined || disposed || (row.state !== "failed" && row.state !== "stopped")) return;
      clearTimeout(row.timer);
      Object.assign(row, { state: "waiting", error: null, giveUp: false, unknownAttempts: 0, progress: null });
      isStopped = false;
      publish();
      pump();
    },
    /** Aborts everything: the page left, the user changed or signed out. */
    dispose(): void {
      disposed = true;
      clearTimeout(holdTimer);
      for (const row of rows) {
        clearTimeout(row.timer);
        row.controller?.abort();
        if (RUNNING.has(row.state)) Object.assign(row, { state: "stopped", controller: null });
      }
      publish();
    },
    /** Takes files again after `dispose` (React runs an effect's cleanup and the effect again in development). */
    reopen(): void {
      disposed = false;
    },
  };
}

export type UploadQueue = ReturnType<typeof createUploadQueue>;
