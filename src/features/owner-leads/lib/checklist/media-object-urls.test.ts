import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ImageResult, MediaItem, MediaList, MediaUiError, MediaVariant } from "@/features/surveys";

import { attachPageEvents, createObjectUrlStore, type ObjectUrlDeps } from "./media-object-urls";

const JPEG = new Blob([new Uint8Array([0xff, 0xd8])], { type: "image/jpeg" });
const ok = (): ImageResult => ({ ok: true, status: 200, replayed: false, data: JPEG });
const http = (status: number, code: string, retryAfterSeconds?: number): ImageResult => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: [],
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
});

function setup(extra: Partial<ObjectUrlDeps> = {}) {
  const reads: Array<{ mediaId: string; variant: MediaVariant; signal: AbortSignal; resolve(result: ImageResult): void }> = [];
  const created: string[] = [];
  const revoked: string[] = [];
  const pageFailures: MediaUiError["kind"][] = [];
  let next = 0;
  const store = createObjectUrlStore({
    read: (mediaId, variant, _download, signal) =>
      new Promise<ImageResult>((resolve) => {
        reads.push({ mediaId, variant, signal, resolve });
      }),
    createObjectURL: () => {
      next += 1;
      const url = `blob:test/${next}`;
      created.push(url);
      return url;
    },
    revokeObjectURL: (url) => revoked.push(url),
    onPageFailure: (error) => pageFailures.push(error.kind),
    now: () => Date.now(),
    onChange: () => undefined,
    ...extra,
  });
  /** Answers the read of `mediaId` (first one waiting). */
  const answer = async (mediaId: string, result: ImageResult = ok()) => {
    const index = reads.findIndex((read) => read.mediaId === mediaId);
    const [read] = reads.splice(index, 1);
    read.resolve(result);
    await vi.advanceTimersByTimeAsync(0);
  };
  return { store, reads, created, revoked, pageFailures, answer };
}

const item = (id: string, overrides: Partial<MediaItem> = {}): MediaItem => ({ id, status: "READY", contentAvailable: true, removed: null, ...overrides });
const list = (items: MediaItem[], servingEnabled = true): MediaList => ({ checklistId: "C1", setVersion: 2, servingEnabled, items, notAcceptedItems: [], removedItems: [] });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("object URL store: reads stop with the page (SM-FE-08)", () => {
  it("revokeAll_abortsEveryReadOnItsWay", () => {
    const { store, reads } = setup();
    store.request("M1", "thumbnail");
    store.request("M2", "preview");
    expect(reads.map((read) => read.signal.aborted)).toEqual([false, false]);

    store.revokeAll({ block: true });

    expect(reads.map((read) => read.signal.aborted)).toEqual([true, true]);
  });

  it("dispose_routeLeave_abortsTheReads", () => {
    const { store, reads } = setup();
    store.request("M1", "thumbnail");
    store.dispose();
    expect(reads[0].signal.aborted).toBe(true);
  });

  it("revokeMedia_abortsOnlyThatPhotosReads", () => {
    const { store, reads } = setup();
    store.request("M1", "thumbnail");
    store.request("M2", "thumbnail");
    store.revokeMedia("M1");
    expect(reads.map((read) => [read.mediaId, read.signal.aborted])).toEqual([
      ["M1", true],
      ["M2", false],
    ]);
  });

  it("anAbortedReadThatAnswersAsANetworkError_leavesNoUnavailableMark", async () => {
    const { store, answer } = setup();
    store.request("M1", "thumbnail");
    store.revokeMedia("M1");
    await answer("M1", { ok: false, kind: "network" });
    expect(store.get("M1", "thumbnail")).toBeUndefined();
    // Asked again later (a new list), it reads again.
    store.request("M1", "thumbnail");
    expect(store.get("M1", "thumbnail")).toEqual({ state: "loading" });
  });
});

describe("object URL store: SM-FE-03, SM-FE-04, SM-FE-05 (SV-071)", () => {
  const NETWORK: ImageResult = { ok: false, kind: "network" };

  it("SM-FE-03: a one-off network error reads again after 5 s instead of keeping no image", async () => {
    const { store, reads, answer } = setup();
    store.request("M1", "thumbnail");
    await answer("M1", NETWORK);
    // The placeholder says loading, not "No image", while it waits.
    expect(store.get("M1", "thumbnail")).toEqual({ state: "waiting", retryAt: 5_000 });
    expect(reads).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reads).toHaveLength(1);
    await answer("M1");
    expect(store.get("M1", "thumbnail")).toMatchObject({ state: "ready" });
  });

  it("SM-FE-03: bounded: after 5, 15 and 45 s of failed reads (a 5xx too) the photo shows no image", async () => {
    const { store, reads, answer } = setup();
    store.request("M1", "thumbnail");
    for (const wait of [5_000, 15_000, 45_000]) {
      await answer("M1", wait === 15_000 ? http(502, "BAD_GATEWAY") : NETWORK);
      expect(store.get("M1", "thumbnail")).toMatchObject({ state: "waiting" });
      await vi.advanceTimersByTimeAsync(wait);
      expect(reads).toHaveLength(1);
    }
    await answer("M1", NETWORK);
    expect(store.get("M1", "thumbnail")).toEqual({ state: "unavailable" });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(reads).toHaveLength(0);
  });

  it("SM-FE-03: a read that succeeds starts the waits again from 5 s", async () => {
    const { store, answer } = setup();
    store.request("M1", "thumbnail");
    await answer("M1", NETWORK);
    await vi.advanceTimersByTimeAsync(5_000);
    await answer("M1");
    store.request("M1", "preview");
    await answer("M1", NETWORK);
    expect(store.get("M1", "preview")).toEqual({ state: "waiting", retryAt: 5_000 + 5_000 });
  });

  it("SM-FE-04: another visit's matching photo is read once and stays through list updates", async () => {
    const { store, reads, answer, revoked } = setup();
    store.request("OTHER", "thumbnail", { otherVisit: true });
    await answer("OTHER");
    store.applyList(list([item("M1")]));
    store.applyList(list([item("M1"), item("M2")]));
    expect(store.get("OTHER", "thumbnail")).toMatchObject({ state: "ready" });
    store.request("OTHER", "thumbnail", { otherVisit: true });
    expect(reads).toHaveLength(0);
    expect(revoked).toEqual([]);
  });

  it("SM-FE-04: it still goes with every image on a revoke-all and with serving off", async () => {
    const { store, answer, revoked } = setup();
    store.request("OTHER", "thumbnail", { otherVisit: true });
    await answer("OTHER");
    store.applyList(list([item("M1")], false));
    expect(revoked).toEqual(["blob:test/1"]);
    expect(store.get("OTHER", "thumbnail")).toBeUndefined();
  });

  it("SM-FE-04: released when its upload row goes (dismissed, replaced, cancelled)", async () => {
    const { store, answer, revoked } = setup();
    store.request("OTHER", "thumbnail", { otherVisit: true });
    await answer("OTHER");
    store.release("OTHER");
    expect(revoked).toEqual(["blob:test/1"]);
    expect(store.get("OTHER", "thumbnail")).toBeUndefined();
  });

  it("SM-FE-04: release leaves the photos of this checklist alone", async () => {
    const { store, answer, revoked } = setup();
    store.applyList(list([item("M1")]));
    store.request("M1", "thumbnail");
    await answer("M1");
    store.release("M1");
    expect(revoked).toEqual([]);
    expect(store.get("M1", "thumbnail")).toMatchObject({ state: "ready" });
  });

  it("SM-FE-04: checked again at most once a minute, so a hold or removal of that photo shows", async () => {
    const { store, reads, answer, revoked } = setup();
    store.request("OTHER", "thumbnail", { otherVisit: true });
    await answer("OTHER");
    await vi.advanceTimersByTimeAsync(59_000);
    store.applyList(list([item("M1")]));
    expect(revoked).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    store.applyList(list([item("M1")]));
    expect(revoked).toEqual(["blob:test/1"]);
    store.request("OTHER", "thumbnail", { otherVisit: true });
    expect(reads).toHaveLength(1);
    // Held or removed meanwhile: the server refuses it, and the page shows no image.
    await answer("OTHER", http(409, "MEDIA_NOT_AVAILABLE"));
    expect(store.get("OTHER", "thumbnail")).toEqual({ state: "unavailable" });
  });

  it("SM-FE-04: an idle page (the list answers 204) checks it again after a minute too", async () => {
    const { store, reads, answer, revoked } = setup();
    store.request("OTHER", "thumbnail", { otherVisit: true });
    await answer("OTHER");
    await vi.advanceTimersByTimeAsync(59_000);
    store.confirmAccess();
    expect(revoked).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    store.confirmAccess();
    expect(revoked).toEqual(["blob:test/1"]);
    store.request("OTHER", "thumbnail", { otherVisit: true });
    expect(reads).toHaveLength(1);
  });

  it("SM-FE-04: a photo of this checklist gone from the list is still revoked", async () => {
    const { store, answer, revoked } = setup();
    store.request("M4", "thumbnail");
    await answer("M4");
    store.applyList(list([item("M1")]));
    expect(revoked).toEqual(["blob:test/1"]);
  });

  it("SM-FE-05: serving off on an image while a list says on: reads wait 15 s, then 30 s, not a tight loop", async () => {
    const servingOff: number[] = [];
    const { store, reads, answer } = setup({ onServingOff: () => servingOff.push(1) });
    store.applyList(list([item("M1")]));
    store.request("M1", "thumbnail");
    await answer("M1", http(503, "MEDIA_SERVING_DISABLED"));
    expect(servingOff).toHaveLength(1);
    const epoch = store.epoch();

    // The list read it asks for reaches an instance that still serves.
    store.applyList(list([item("M1")]));
    store.request("M1", "thumbnail");
    expect(reads).toHaveLength(0);
    expect(store.epoch()).toBe(epoch);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(store.epoch()).toBeGreaterThan(epoch);
    store.request("M1", "thumbnail");
    expect(reads).toHaveLength(1);

    // Off again on the next image: the second wait is 30 s.
    await answer("M1", http(503, "MEDIA_SERVING_DISABLED"));
    expect(servingOff).toHaveLength(2);
    store.applyList(list([item("M1")]));
    await vi.advanceTimersByTimeAsync(15_000);
    store.request("M1", "thumbnail");
    expect(reads).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(15_000);
    store.request("M1", "thumbnail");
    expect(reads).toHaveLength(1);
  });

  it("SM-FE-05: a list saying off during the wait keeps images off when the wait ends", async () => {
    const { store, reads, answer } = setup();
    store.request("M1", "thumbnail");
    await answer("M1", http(503, "MEDIA_SERVING_DISABLED"));
    store.applyList(list([item("M1")]));
    store.applyList(list([item("M1")], false));
    await vi.advanceTimersByTimeAsync(60_000);
    store.request("M1", "thumbnail");
    expect(reads).toHaveLength(0);
  });

  it("SM-FE-05: a list off and then on (a restart seen by the lists) turns images back on at once", async () => {
    const { store, reads } = setup();
    store.applyList(list([item("M1")], false));
    store.applyList(list([item("M1")]));
    store.request("M1", "thumbnail");
    expect(reads).toHaveLength(1);
  });

  it("SM-FE-05: an image that loads resets the waits", async () => {
    const { store, reads, answer } = setup();
    store.request("M1", "thumbnail");
    await answer("M1", http(503, "MEDIA_SERVING_DISABLED"));
    store.applyList(list([item("M1")]));
    await vi.advanceTimersByTimeAsync(15_000);
    store.request("M1", "thumbnail");
    await answer("M1");
    store.request("M1", "preview");
    await answer("M1", http(503, "MEDIA_SERVING_DISABLED"));
    store.applyList(list([item("M1")]));
    await vi.advanceTimersByTimeAsync(15_000);
    store.request("M1", "preview");
    expect(reads).toHaveLength(1);
  });
});

describe("object URL store (survey-media spec 6.2 images, A-24, A-25; SM-28)", () => {
  it("creates an object URL from a JPEG and keeps it by media id and variant", async () => {
    const { store, answer } = setup();
    store.request("M1", "thumbnail");
    await answer("M1");
    expect(store.get("M1", "thumbnail")).toEqual({ state: "ready", url: "blob:test/1" });
    expect(store.get("M1", "preview")).toBeUndefined();
  });

  it("nonJpeg_noObjectUrl", async () => {
    const { store, created, answer } = setup();
    store.request("M1", "thumbnail");
    await answer("M1", { ok: false, kind: "not-jpeg" });
    expect(created).toEqual([]);
    expect(store.get("M1", "thumbnail")).toEqual({ state: "unavailable" });
  });

  it("atMostFourParallel", async () => {
    const { store, reads, answer } = setup();
    for (const id of ["M1", "M2", "M3", "M4", "M5", "M6"]) store.request(id, "thumbnail");
    expect(reads.map((read) => read.mediaId)).toEqual(["M1", "M2", "M3", "M4"]);
    await answer("M2");
    expect(reads.map((read) => read.mediaId)).toEqual(["M1", "M3", "M4", "M5"]);
  });

  it("asks once per media id and variant", () => {
    const { store, reads } = setup();
    store.request("M1", "thumbnail");
    store.request("M1", "thumbnail");
    expect(reads).toHaveLength(1);
  });

  it("revokedOn404AfterReassignment: a 404 revokes every URL and goes to the page", async () => {
    const { store, revoked, pageFailures, answer } = setup();
    store.request("M1", "thumbnail");
    store.request("M2", "thumbnail");
    await answer("M1");
    await answer("M2");
    store.request("M3", "thumbnail");
    await answer("M3", http(404, "NOT_FOUND"));
    expect(revoked.sort()).toEqual(["blob:test/1", "blob:test/2"]);
    expect(store.get("M1", "thumbnail")).toBeUndefined();
    expect(pageFailures).toEqual(["not-found"]);
  });

  it("a 403 revokes every URL too", async () => {
    const { store, revoked, pageFailures, answer } = setup();
    store.request("M1", "thumbnail");
    await answer("M1");
    store.request("M2", "preview");
    await answer("M2", http(403, "FORBIDDEN"));
    expect(revoked).toEqual(["blob:test/1"]);
    expect(pageFailures).toEqual(["forbidden"]);
  });

  it("revokedOnPhoto409: a 409 revokes that photo's URLs only", async () => {
    const { store, revoked, answer } = setup();
    store.request("M1", "thumbnail");
    store.request("M2", "thumbnail");
    await answer("M1");
    await answer("M2");
    store.request("M1", "preview");
    await answer("M1", http(409, "MEDIA_NOT_AVAILABLE"));
    expect(revoked).toEqual(["blob:test/1"]);
    expect(store.get("M2", "thumbnail")).toMatchObject({ state: "ready" });
    expect(store.get("M1", "preview")).toEqual({ state: "unavailable" });
  });

  it("revokedWhenServingDisabled: a list with servingEnabled false revokes all and reads nothing more", async () => {
    const { store, reads, revoked, answer } = setup();
    store.request("M1", "thumbnail");
    await answer("M1");
    store.applyList(list([item("M1")], false));
    expect(revoked).toEqual(["blob:test/1"]);
    store.request("M2", "thumbnail");
    expect(reads).toHaveLength(0);
    store.applyList(list([item("M1")], true));
    store.request("M2", "thumbnail");
    expect(reads).toHaveLength(1);
  });

  it("a list that marks a photo unavailable, removed or gone revokes its URLs", async () => {
    const { store, revoked, answer } = setup();
    for (const id of ["M1", "M2", "M3", "M4"]) store.request(id, "thumbnail");
    for (const id of ["M1", "M2", "M3", "M4"]) await answer(id);
    store.applyList(
      list([
        item("M1"),
        item("M2", { contentAvailable: false, unavailableReason: "HELD" }),
        item("M3", { removed: { at: "x", byUserId: "u", kind: "HOLDER" } }),
      ]),
    );
    expect(revoked.sort()).toEqual(["blob:test/2", "blob:test/3", "blob:test/4"]);
    expect(store.get("M1", "thumbnail")).toMatchObject({ state: "ready" });
  });

  it("a URL answered after its photo was revoked is revoked at once", async () => {
    const { store, revoked, answer } = setup();
    store.request("M1", "thumbnail");
    store.revokeAll();
    await answer("M1");
    expect(revoked).toEqual(["blob:test/1"]);
    expect(store.get("M1", "thumbnail")).toBeUndefined();
  });

  it("a 429 or 503 waits for Retry-After with the placeholder, then reads again", async () => {
    const { store, reads, answer } = setup();
    store.request("M1", "thumbnail");
    await answer("M1", http(429, "RATE_LIMITED", 3));
    expect(store.get("M1", "thumbnail")).toMatchObject({ state: "waiting" });
    expect(reads).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(reads).toHaveLength(1);
    await answer("M1", http(503, "MEDIA_SERVER_BUSY", 2));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(reads).toHaveLength(1);
  });

  it("revokedOnPagehideAndSignOut: pagehide and dispose (sign-out, user change, route leave) revoke all", async () => {
    const { store, revoked, answer } = setup();
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    const detach = attachPageEvents(windowTarget, documentTarget, store);
    store.request("M1", "thumbnail");
    await answer("M1");
    windowTarget.dispatchEvent(new Event("pagehide"));
    expect(revoked).toEqual(["blob:test/1"]);
    // Pagehide keeps reads off until the list is read again (pageshow from the bfcache reads it).
    store.request("M2", "thumbnail");
    expect(store.get("M2", "thumbnail")).toBeUndefined();
    store.confirmAccess();
    store.request("M2", "thumbnail");
    await answer("M2");
    detach();
    store.dispose();
    expect(revoked).toEqual(["blob:test/1", "blob:test/2"]);
  });

  it("notRevokedOnCameraOpen: the page hidden while the camera is open keeps the URLs", async () => {
    const { store, revoked, answer } = setup();
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    attachPageEvents(windowTarget, documentTarget, store);
    store.request("M1", "thumbnail");
    await answer("M1");
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    windowTarget.dispatchEvent(new Event("blur"));
    expect(revoked).toEqual([]);
    expect(store.get("M1", "thumbnail")).toMatchObject({ state: "ready" });
  });

  it("nothingInStorageOrCacheApi: no sessionStorage, localStorage, IndexedDB or Cache API write", async () => {
    const touched: string[] = [];
    const trap = (name: string) =>
      new Proxy(
        {},
        {
          get: (_target, property) => {
            touched.push(`${name}.${String(property)}`);
            return () => undefined;
          },
        },
      );
    vi.stubGlobal("sessionStorage", trap("sessionStorage"));
    vi.stubGlobal("localStorage", trap("localStorage"));
    vi.stubGlobal("indexedDB", trap("indexedDB"));
    vi.stubGlobal("caches", trap("caches"));
    const { store, answer } = setup();
    store.request("M1", "thumbnail");
    store.request("M1", "preview");
    await answer("M1");
    await answer("M1");
    const download = store.download("M1");
    await answer("M1");
    await download;
    store.applyList(list([item("M1")], false));
    store.dispose();
    expect(touched).toEqual([]);
  });

  it("download reads the full file as a download and gives a one-time URL", async () => {
    const { store, reads, answer } = setup();
    const pending = store.download("M1");
    expect(reads[0]).toMatchObject({ mediaId: "M1", variant: "full" });
    await answer("M1");
    expect(await pending).toEqual({ ok: true, url: "blob:test/1" });
  });
});

describe("object URL store latch (review fix M-1: no read loop after a 403 or 404)", () => {
  /** A store whose reads always answer `status`, and a "renderer" that asks again after every change, as PhotoThumb does. */
  function looping(status: number) {
    const reads: string[] = [];
    const failures: string[] = [];
    const ref: { store?: ReturnType<typeof createObjectUrlStore> } = {};
    const store = createObjectUrlStore({
      read: async (mediaId, variant) => {
        reads.push(`${mediaId}:${variant}`);
        return http(status, status === 403 ? "FORBIDDEN" : "NOT_FOUND");
      },
      createObjectURL: () => "blob:x",
      revokeObjectURL: () => undefined,
      onPageFailure: (error) => failures.push(error.kind),
      now: () => Date.now(),
      onChange: () => {
        ref.store?.request("M1", "thumbnail");
        ref.store?.request("M2", "thumbnail");
      },
    });
    ref.store = store;
    return { store, reads, failures };
  }

  it("imageForbidden_latchesUntilListConfirmsAccess: one 403 stops every read until a list read succeeds", async () => {
    const { store, reads, failures } = looping(403);
    store.request("M1", "thumbnail");
    await vi.advanceTimersByTimeAsync(1_000);
    // The two images on screen were both asked before the first 403 came back; nothing after it.
    expect(reads).toEqual(["M1:thumbnail", "M2:thumbnail"]);
    expect(failures).toEqual(["forbidden"]);
    store.confirmAccess();
    await vi.advanceTimersByTimeAsync(1_000);
    // One round per confirmed list read, never a loop.
    expect(reads).toHaveLength(4);
    expect(failures).toEqual(["forbidden", "forbidden"]);
  });

  it("a 404 latches the same way", async () => {
    const { store, reads, failures } = looping(404);
    store.request("M1", "thumbnail");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reads).toHaveLength(2);
    expect(failures).toEqual(["not-found"]);
  });

  it("an access revoke (checklist 403 or 404, pagehide) refuses reads until the next list, then asks again", async () => {
    const { store, reads, answer } = setup();
    store.request("M1", "thumbnail");
    await answer("M1");
    const before = store.epoch();
    store.revokeAll({ block: true });
    store.request("M1", "thumbnail");
    expect(reads).toHaveLength(0);
    store.applyList(list([item("M1")]));
    expect(store.epoch()).toBe(before + 1);
    store.request("M1", "thumbnail");
    expect(reads).toHaveLength(1);
  });

  it("budget429_showsBudgetMinutes: a refused budget waits with the minutes of spec 6.3", async () => {
    const { store, answer } = setup();
    store.request("M1", "thumbnail");
    await answer("M1", {
      ok: false,
      kind: "http",
      status: 429,
      code: "RATE_LIMITED",
      fieldErrors: [{ field: "budget", message: "x" }],
      retryAfterSeconds: 1_800,
    });
    expect(store.get("M1", "thumbnail")).toEqual({ state: "waiting", retryAt: 1_800_000, budgetMinutes: 30 });
  });

  it("servingDisabled503_revokesAllAndAsksList: an image 503 MEDIA_SERVING_DISABLED acts like a list with serving off", async () => {
    const servingOff: number[] = [];
    const created: string[] = [];
    const revoked: string[] = [];
    const reads: Array<{ mediaId: string; resolve(result: ImageResult): void }> = [];
    const store = createObjectUrlStore({
      read: (mediaId) => new Promise((resolve) => reads.push({ mediaId, resolve })),
      createObjectURL: () => {
        created.push(`blob:${created.length + 1}`);
        return `blob:${created.length}`;
      },
      revokeObjectURL: (url) => revoked.push(url),
      onPageFailure: () => undefined,
      onServingOff: () => servingOff.push(1),
      now: () => Date.now(),
      onChange: () => undefined,
    });
    store.request("M1", "thumbnail");
    store.request("M2", "thumbnail");
    reads[0].resolve(ok());
    await vi.advanceTimersByTimeAsync(0);
    reads[1].resolve(http(503, "MEDIA_SERVING_DISABLED", 60));
    await vi.advanceTimersByTimeAsync(0);
    expect(revoked).toEqual(["blob:1"]);
    expect(servingOff).toEqual([1]);
    store.request("M3", "thumbnail");
    expect(reads).toHaveLength(2);
  });
});
