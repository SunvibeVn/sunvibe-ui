import { type ImageResult, type MediaList, type MediaUiError, type MediaVariant, toMediaUiError } from "@/features/surveys";

// The images of survey photos in page memory only (survey-media spec 6.2 images, A-24, A-25; SM-28): an object URL is
// made only from a successful `image/jpeg` answer, kept by media id and variant, and revoked on route leave, `pagehide`,
// any 404 or 403 (lead, checklist or photo), a 409 of the photo, a list that marks it unavailable, sign-out or user
// change, and all of them when a list says `servingEnabled` false. At most 4 reads at a time; a 429 or 503 waits for
// its Retry-After with the placeholder. Nothing goes into sessionStorage, localStorage, IndexedDB or the Cache API.
// A read on its way stops with its image: every revoke-all (route leave, pagehide, a 403 or 404, serving off) aborts
// them all, a photo's revoke aborts its own (SM-FE-08). A network error or a 5xx reads again after 5, 15 and 45 s
// before the photo shows no image (SM-FE-03). The matching photo of another visit is not in this checklist's list:
// a list answer (a 204 included) drops it only once it is a minute old, so it is read at most once a minute (a hold
// or removal of it then shows), and it goes when the row showing it does (SM-FE-04). After an image says serving is off, a list that says it is on (another
// instance, A-24) lets images be read again only after 15, 30, 60, 120, then 300 s (SM-FE-05).

export const MAX_PARALLEL_IMAGES = 4;
const DEFAULT_WAIT_MS = 15_000;
/** The waits before a failed read (network, 5xx) is tried again; after the last one the photo shows no image. */
export const IMAGE_RETRY_MS = [5_000, 15_000, 45_000] as const;
/** How long a list keeps the image of another visit's matching photo before it is read again. */
export const OTHER_VISIT_RECHECK_MS = 60_000;
/** The waits after an image said serving is off while the lists say it is on, one more step per time. */
export const SERVING_COOLDOWN_MS = [15_000, 30_000, 60_000, 120_000, 300_000] as const;

export type ImageEntry =
  | { state: "loading" }
  | { state: "ready"; url: string }
  /** A 429 or 503: read again at `retryAt`; `budgetMinutes` when the hourly budget refused it (spec 6.3 text). */
  | { state: "waiting"; retryAt: number; budgetMinutes?: number }
  | { state: "unavailable" };

export type DownloadResult = { ok: true; url: string } | { ok: false; error: MediaUiError };

export type ObjectUrlDeps = {
  read(mediaId: string, variant: MediaVariant, download: boolean, signal: AbortSignal): Promise<ImageResult>;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  /** A 404 or 403: the page leaves or locks (W16). Called once until a list read confirms access again. */
  onPageFailure(error: MediaUiError): void;
  /** An image answered 503 MEDIA_SERVING_DISABLED: the page reads the list at once (it says `servingEnabled`). */
  onServingOff?(): void;
  now(): number;
  onChange(): void;
};

type Stored = ImageEntry & { mediaId: string };

type Job = { key: string; mediaId: string; variant: MediaVariant; download: boolean; done?: (result: DownloadResult) => void };
type Running = Job & { controller: AbortController };

const keyOf = (mediaId: string, variant: MediaVariant) => `${mediaId}:${variant}`;

export function createObjectUrlStore(deps: ObjectUrlDeps) {
  const entries = new Map<string, Stored>();
  const downloads = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let queue: Job[] = [];
  /** The reads on their way, each with the controller that stops it. */
  const running = new Set<Running>();
  let active = 0;
  let serving = true;
  /** Bumped by every revoke-all: an answer of an older generation is dropped (and its URL revoked). */
  let generation = 0;
  let disposed = false;
  /**
   * Set by a 403 or 404 (an image, the list or the checklist) and by pagehide: no read starts until a list read
   * confirms the viewer still sees the lead (`applyList`, `confirmAccess`). Without it every re-render would read the
   * images again and a 403 would loop (review M-1).
   */
  let blocked = false;
  /** Grows whenever reads may start again (a block lifted, serving back on): the parts showing images ask again. */
  let epoch = 0;
  /** Failed reads (network, 5xx) in a row, by media id and variant. */
  const failures = new Map<string, number>();
  /** Photos of another visit (a duplicate's match), not in this checklist's list, and since when they are kept. */
  const otherVisit = new Map<string, number>();
  /** Images that said serving is off with no image loaded since, and until when reads wait after that. */
  let servingOffByImage = 0;
  let servingWaitUntil = 0;
  let servingTimer: ReturnType<typeof setTimeout> | undefined;
  /** What the last list said about serving. */
  let listServing = true;

  const changed = () => deps.onChange();

  function revokeEntry(key: string) {
    const entry = entries.get(key);
    if (entry?.state === "ready") deps.revokeObjectURL(entry.url);
    clearTimeout(timers.get(key));
    timers.delete(key);
    entries.delete(key);
    failures.delete(key);
  }

  function revokeMedia(mediaId: string) {
    for (const [key, entry] of [...entries]) if (entry.mediaId === mediaId) revokeEntry(key);
    queue = queue.filter((job) => job.mediaId !== mediaId || job.download);
    for (const job of running) if (job.mediaId === mediaId && !job.download) job.controller.abort();
  }

  function unblock() {
    if (!blocked) return;
    blocked = false;
    epoch += 1;
  }

  function revokeAll(options: { block?: boolean } = {}) {
    if (options.block) blocked = true;
    generation += 1;
    for (const key of [...entries.keys()]) revokeEntry(key);
    for (const url of downloads) deps.revokeObjectURL(url);
    downloads.clear();
    for (const job of queue) job.done?.({ ok: false, error: { kind: "aborted" } });
    queue = [];
    // Their answers would be dropped anyway (older generation): stop them now.
    for (const job of running) job.controller.abort();
    otherVisit.clear();
    changed();
  }

  /**
   * Another visit's matching photo a minute old goes, so the part showing it reads it again and a hold or removal of it
   * shows (SM-FE-04); checked on every list answer, a 204 included. True when one went.
   */
  function recheckOtherVisit(): boolean {
    let any = false;
    for (const [mediaId, since] of [...otherVisit]) {
      if (deps.now() - since < OTHER_VISIT_RECHECK_MS) continue;
      otherVisit.delete(mediaId);
      revokeMedia(mediaId);
      any = true;
    }
    return any;
  }

  /** Reads wait for the cool-down (SM-FE-05) and start again after it, unless a list said serving is off meanwhile. */
  function waitForServing() {
    clearTimeout(servingTimer);
    servingTimer = setTimeout(() => {
      servingTimer = undefined;
      if (disposed || serving || !listServing) return;
      serving = true;
      epoch += 1;
      changed();
    }, Math.max(0, servingWaitUntil - deps.now()));
  }

  /** Puts the read of `job` back in the queue after `wait`, with the placeholder meanwhile. */
  function readAgainLater(job: Job, wait: number, budgetMinutes?: number) {
    entries.set(job.key, {
      state: "waiting",
      retryAt: deps.now() + wait,
      ...(budgetMinutes === undefined ? {} : { budgetMinutes }),
      mediaId: job.mediaId,
    });
    timers.set(
      job.key,
      setTimeout(() => {
        timers.delete(job.key);
        if (disposed || !serving || blocked || entries.get(job.key)?.state !== "waiting") return;
        entries.set(job.key, { state: "loading", mediaId: job.mediaId });
        queue.push({ key: job.key, mediaId: job.mediaId, variant: job.variant, download: false });
        changed();
        pump();
      }, wait),
    );
    changed();
  }

  function pump() {
    while (!disposed && active < MAX_PARALLEL_IMAGES && queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) break;
      const job: Running = { ...next, controller: new AbortController() };
      running.add(job);
      active += 1;
      const mine = generation;
      void deps
        .read(job.mediaId, job.variant, job.download, job.controller.signal)
        .then(
          (result) => settle(job, result, mine),
          () => settle(job, { ok: false, kind: "network" }, mine),
        )
        .finally(() => {
          running.delete(job);
          active -= 1;
          pump();
        });
    }
  }

  function settle(job: Job, result: ImageResult, mine: number) {
    const stale = disposed || mine !== generation || (!job.download && !entries.has(job.key));
    if (result.ok) {
      const url = deps.createObjectURL(result.data);
      if (stale) {
        deps.revokeObjectURL(url);
        job.done?.({ ok: false, error: { kind: "aborted" } });
        return;
      }
      servingOffByImage = 0;
      if (job.download) {
        downloads.add(url);
        job.done?.({ ok: true, url });
        return;
      }
      failures.delete(job.key);
      entries.set(job.key, { state: "ready", url, mediaId: job.mediaId });
      changed();
      return;
    }
    if (stale) {
      job.done?.({ ok: false, error: { kind: "aborted" } });
      return;
    }
    const error = toMediaUiError(result, "image") ?? { kind: "retry" as const };
    if (result.kind === "http" && (result.status === 404 || result.status === 403)) {
      const first = !blocked;
      revokeAll({ block: true });
      job.done?.({ ok: false, error });
      if (first) deps.onPageFailure(error);
      return;
    }
    if (result.kind === "http" && result.status === 503 && result.code === "MEDIA_SERVING_DISABLED") {
      // Serving is off (A-24): every URL goes now, and the list read says when it is back, not before the wait.
      const step = SERVING_COOLDOWN_MS[Math.min(servingOffByImage, SERVING_COOLDOWN_MS.length - 1)];
      servingOffByImage += 1;
      servingWaitUntil = Math.max(servingWaitUntil, deps.now() + Math.max(step, (error.retryAfterSeconds ?? 0) * 1000));
      serving = false;
      revokeAll();
      job.done?.({ ok: false, error });
      deps.onServingOff?.();
      return;
    }
    if (result.kind === "http" && result.status === 409) {
      revokeMedia(job.mediaId);
      if (!job.download) entries.set(job.key, { state: "unavailable", mediaId: job.mediaId });
      job.done?.({ ok: false, error });
      changed();
      return;
    }
    if (result.kind === "http" && (result.status === 429 || result.status === 503) && !job.download) {
      const wait = error.retryAfterSeconds !== undefined && error.retryAfterSeconds > 0 ? error.retryAfterSeconds * 1000 : DEFAULT_WAIT_MS;
      readAgainLater(job, wait, error.kind === "rate-budget" ? error.minutes : undefined);
      return;
    }
    const transient = result.kind === "network" || (result.kind === "http" && result.status >= 500);
    const failed = failures.get(job.key) ?? 0;
    if (transient && !job.download && failed < IMAGE_RETRY_MS.length) {
      failures.set(job.key, failed + 1);
      readAgainLater(job, IMAGE_RETRY_MS[failed]);
      return;
    }
    if (!job.download) entries.set(job.key, { state: "unavailable", mediaId: job.mediaId });
    job.done?.({ ok: false, error });
    changed();
  }

  return {
    /**
     * Reads the variant once (unless serving is off or it is already there or on its way). `otherVisit`: the matching
     * photo of another visit, which this checklist's list does not hold.
     */
    request(mediaId: string, variant: MediaVariant, options: { otherVisit?: boolean } = {}): void {
      if (disposed || !serving || blocked) return;
      const key = keyOf(mediaId, variant);
      if (options.otherVisit && !otherVisit.has(mediaId)) otherVisit.set(mediaId, deps.now());
      if (entries.has(key)) return;
      entries.set(key, { state: "loading", mediaId });
      queue.push({ key, mediaId, variant, download: false });
      changed();
      pump();
    },
    get(mediaId: string, variant: MediaVariant): ImageEntry | undefined {
      const entry = entries.get(keyOf(mediaId, variant));
      if (entry === undefined) return undefined;
      switch (entry.state) {
        case "ready":
          return { state: "ready", url: entry.url };
        case "waiting":
          return entry.budgetMinutes === undefined
            ? { state: "waiting", retryAt: entry.retryAt }
            : { state: "waiting", retryAt: entry.retryAt, budgetMinutes: entry.budgetMinutes };
        default:
          return { state: entry.state };
      }
    },
    /** Reads the full file for a download (A-6 logs it as one); the URL lives until `releaseDownload` or a revoke. */
    download(mediaId: string): Promise<DownloadResult> {
      if (disposed || !serving) return Promise.resolve({ ok: false, error: { kind: "serving-disabled" } });
      if (blocked) return Promise.resolve({ ok: false, error: { kind: "aborted" } });
      return new Promise<DownloadResult>((done) => {
        queue.push({ key: keyOf(mediaId, "full"), mediaId, variant: "full", download: true, done });
        pump();
      });
    },
    releaseDownload(url: string): void {
      if (downloads.delete(url)) deps.revokeObjectURL(url);
    },
    /** A list arrived: serving off revokes everything; a photo no longer servable loses its URLs. */
    applyList(list: MediaList): void {
      const wasServing = serving;
      listServing = list.servingEnabled !== false;
      if (!listServing) {
        serving = false;
        clearTimeout(servingTimer);
        servingTimer = undefined;
        revokeAll();
        return;
      }
      if (deps.now() < servingWaitUntil) {
        // An image said serving is off a moment ago: another instance's "on" waits for the cool-down (SM-FE-05).
        if (!wasServing) waitForServing();
      } else {
        serving = true;
        // A list answered: the viewer still sees the lead, so reads may start again.
        if (!wasServing) epoch += 1;
      }
      unblock();
      const servable = new Set(
        (list.items ?? [])
          .filter((item) => item.contentAvailable === true && !item.removed && item.id)
          .map((item) => item.id as string),
      );
      let any = recheckOtherVisit();
      for (const [key, entry] of [...entries]) {
        if (!servable.has(entry.mediaId) && !otherVisit.has(entry.mediaId)) {
          revokeEntry(key);
          any = true;
        }
      }
      if (any) changed();
    },
    revokeMedia(mediaId: string): void {
      revokeMedia(mediaId);
      changed();
    },
    /** The part showing another visit's matching photo went: its image goes too (a photo of this checklist stays). */
    release(mediaId: string): void {
      if (!otherVisit.delete(mediaId)) return;
      revokeMedia(mediaId);
      changed();
    },
    /** Revokes every URL; `block` keeps reads off until a list read confirms access (403, 404, pagehide). */
    revokeAll,
    /** A list read answered 204 (unchanged): the viewer still sees the lead. */
    confirmAccess(): void {
      const rechecked = recheckOtherVisit();
      if (blocked) unblock();
      else if (!rechecked) return;
      changed();
    },
    /** Grows whenever reads may start again; the parts showing images ask again on a new value. */
    epoch: (): number => epoch,
    /** The page left, the user signed out or changed: everything goes. */
    dispose(): void {
      revokeAll();
      clearTimeout(servingTimer);
      servingTimer = undefined;
      disposed = true;
    },
  };
}

export type ObjectUrlStore = ReturnType<typeof createObjectUrlStore>;

/**
 * Revokes every object URL on `pagehide` (the page is left or put into the bfcache, which reads the list again on
 * `pageshow`). Not on `visibilitychange` or `blur`: opening the camera hides the page without leaving it.
 */
export function attachPageEvents(windowTarget: EventTarget, _documentTarget: EventTarget, store: Pick<ObjectUrlStore, "revokeAll">): () => void {
  const onPageHide = () => store.revokeAll({ block: true });
  windowTarget.addEventListener("pagehide", onPageHide);
  return () => windowTarget.removeEventListener("pagehide", onPageHide);
}
