import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import type { MediaCreated, MediaCreateInput, MediaItem, MediaList, UploadInput, UploadResult } from "@/features/surveys";

import { createUploadQueue, type UploadQueueDeps } from "./media-upload-queue";

type Reply<T> = ApiResult<T> | { ok: false; kind: "aborted" };

const http = (status: number, code: string, field?: string, retryAfterSeconds?: number) =>
  ({
    ok: false,
    kind: "http",
    status,
    code,
    fieldErrors: field ? [{ field, message: "x" }] : [],
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  }) as const;

const created = (id: string, status: MediaItem["status"] = "AWAITING_CONTENT"): ApiResult<MediaCreated> => ({
  ok: true,
  status: 201,
  replayed: false,
  data: { media: { id, status }, setVersion: 1 },
});
const accepted = (id: string): UploadResult => ({
  ok: true,
  status: 202,
  replayed: false,
  data: { media: { id, status: "PROCESSING" }, setVersion: 2, historyEntry: null },
});

/** A scripted server: answers each create and upload in turn from the queues the test fills, else waits. */
function setup(overrides: Partial<UploadQueueDeps> = {}) {
  const creates: MediaCreateInput[] = [];
  const uploads: UploadInput[] = [];
  const createReplies: Array<Reply<MediaCreated> | Promise<Reply<MediaCreated>>> = [];
  const discarded: string[] = [];
  const hashed: number[] = [];
  let maxFileBytes: number | null = null;
  const uploadReplies: UploadResult[] = [];
  const lists: Array<MediaList | null> = [];
  const pageFailures: string[] = [];
  let keys = 0;
  let mediaIds = 0;
  const waiting: Array<() => void> = [];
  const deps: UploadQueueDeps = {
    checklistId: "C1",
    hash: async (file) => {
      hashed.push(file.size);
      return { hex: "a".repeat(64), base64: "qq==" };
    },
    create: (_checklistId, input) => {
      creates.push(input);
      const reply = createReplies.shift();
      if (reply) return Promise.resolve(reply as ApiResult<MediaCreated>);
      mediaIds += 1;
      return Promise.resolve(created(`M${mediaIds}`));
    },
    upload: (input) => {
      uploads.push(input);
      const reply = uploadReplies.shift();
      if (reply) return Promise.resolve(reply);
      return new Promise<UploadResult>((resolve) => waiting.push(() => resolve(accepted(input.mediaId))));
    },
    readList: async () => (lists.length > 0 ? (lists.shift() ?? null) : null),
    onPageFailure: (error) => pageFailures.push(error.kind),
    onAnswer: () => undefined,
    discard: (mediaId) => discarded.push(mediaId),
    maxFileBytes: () => maxFileBytes,
    newUploadKey: () => `K${(keys += 1)}`,
    now: () => Date.now(),
    onChange: () => undefined,
  };
  const queue = createUploadQueue({ ...deps, ...overrides });
  return {
    queue,
    creates,
    uploads,
    createReplies,
    uploadReplies,
    lists,
    pageFailures,
    discarded,
    hashed,
    setMaxFileBytes: (value: number | null) => {
      maxFileBytes = value;
    },
    finishUploads: () => {
      for (const done of waiting.splice(0)) done();
    },
    states: () => queue.rows().map((row) => row.state),
  };
}

const file = (size = 10) => new Blob([new Uint8Array(size)]);
const placement = { spaceId: null, category: "EXTERIOR_ACCESS" as const, caption: null };
const listWith = (item: MediaItem): MediaList => ({ checklistId: "C1", setVersion: 3, items: [item], notAcceptedItems: [], removedItems: [] });
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("upload queue: SM-FE-01 and SM-FE-02 (SV-071)", () => {
  it("SM-FE-01: Upload again while the list lags sends the bytes to the row's own record named as the duplicate", async () => {
    const { queue, uploads, uploadReplies, createReplies, lists, states } = setup();
    uploadReplies.push({ ok: false, kind: "network" });
    // The list read after the lost PUT is older than the create: it has no M1 yet.
    lists.push({ checklistId: "C1", setVersion: 0, items: [], notAcceptedItems: [], removedItems: [] });
    queue.add([file()], placement);
    await settle();
    expect(queue.rows()[0]).toMatchObject({ state: "failed", mediaId: "M1", error: { kind: "upload-again" } });

    // The server still has M1 awaiting these bytes: a new photo of the same bytes is refused as its duplicate.
    createReplies.push({ ...http(409, "MEDIA_DUPLICATE_CONTENT"), fieldErrors: [{ field: "contentSha256", message: "x", allowedValues: ["M1"] }] });
    queue.againAsNew(queue.rows()[0].id);
    await settle();

    expect(uploads.map((input) => input.mediaId)).toEqual(["M1", "M1"]);
    expect(states()).toEqual(["uploading"]);
    expect(queue.rows()[0]).toMatchObject({ mediaId: "M1", error: null });
  });

  it("SM-FE-01: a duplicate of another photo still fails as a duplicate", async () => {
    const { queue, createReplies, uploads } = setup();
    createReplies.push({ ...http(409, "MEDIA_DUPLICATE_CONTENT"), fieldErrors: [{ field: "contentSha256", message: "x", allowedValues: ["M9"] }] });
    queue.add([file()], placement);
    await settle();
    expect(queue.rows()[0]).toMatchObject({ state: "failed", error: { kind: "duplicate", matchingMediaId: "M9" } });
    // Upload again of that row makes a new photo; the same duplicate is refused again, it is not adopted.
    createReplies.push({ ...http(409, "MEDIA_DUPLICATE_CONTENT"), fieldErrors: [{ field: "contentSha256", message: "x", allowedValues: ["M9"] }] });
    queue.againAsNew(queue.rows()[0].id);
    await settle();
    expect(queue.rows()[0]).toMatchObject({ state: "failed", error: { kind: "duplicate" } });
    expect(uploads).toHaveLength(0);
  });

  it("SM-FE-02: hashing or creating still running after a cancel counts toward the 3 at a time", async () => {
    const pending: Array<() => void> = [];
    let hashing = 0;
    let most = 0;
    const { queue, states } = setup({
      hash: () =>
        new Promise((resolve) => {
          hashing += 1;
          most = Math.max(most, hashing);
          pending.push(() => {
            hashing -= 1;
            resolve({ hex: "a".repeat(64), base64: "qq==" });
          });
        }),
    });
    queue.add([file(), file(), file()], placement);
    await settle();
    for (const row of queue.rows()) queue.cancel(row.id);
    queue.add([file(), file(), file()], placement);
    await settle();

    expect(hashing).toBe(3);
    expect(states()).toEqual(["waiting", "waiting", "waiting"]);

    pending.shift()?.();
    await settle();
    expect(states()).toEqual(["hashing", "waiting", "waiting"]);
    expect(most).toBe(3);
  });

  it("SM-FE-02: a create answering after its cancel holds its place until then, then gives the record back", async () => {
    let answerFirst: (() => void) | null = null;
    let calls = 0;
    const { queue, discarded, states } = setup({
      create: () => {
        calls += 1;
        if (calls === 1) return new Promise((resolve) => (answerFirst = () => resolve(created("M1"))));
        return Promise.resolve(created(`M${calls}`));
      },
    });
    queue.add([file(), file(), file(), file()], placement);
    await settle();
    expect(states()).toEqual(["creating", "uploading", "uploading", "waiting"]);

    queue.cancel(queue.rows()[0].id);
    await settle();
    // The cancelled create is still on its way: the fourth file keeps waiting.
    expect(states()).toEqual(["uploading", "uploading", "waiting"]);

    (answerFirst as (() => void) | null)?.();
    await settle();
    expect(discarded).toEqual(["M1"]);
    expect(states()).toEqual(["uploading", "uploading", "uploading"]);
  });
});

describe("upload queue (survey-media spec 6.2 Uploader; SM-27)", () => {
  it("eachFileOwnState: up to 3 at a time, each file with its own row, key and state", async () => {
    const { queue, creates, states } = setup();
    queue.add([file(), file(), file(), file()], placement);
    await settle();
    expect(states()).toEqual(["uploading", "uploading", "uploading", "waiting"]);
    expect(creates.map((input) => input.uploadKey)).toEqual(["K1", "K2", "K3"]);
    expect(new Set(queue.rows().map((row) => row.id)).size).toBe(4);
  });

  it("sends every key of the create: placement, category, caption, size and the hex hash", async () => {
    const { queue, creates } = setup();
    queue.add([file(1234)], { spaceId: "P1", category: "KITCHEN", caption: "Sink" });
    await settle();
    expect(creates[0]).toEqual({
      uploadKey: "K1",
      spaceId: "P1",
      category: "KITCHEN",
      caption: "Sink",
      sizeBytes: 1234,
      contentSha256: "a".repeat(64),
    });
  });

  it("failedFileNeverStopsOthers: a refused file fails alone, the next one starts", async () => {
    const { queue, createReplies, states } = setup();
    createReplies.push(http(409, "MEDIA_DUPLICATE_CONTENT", "contentSha256"));
    queue.add([file(), file(), file(), file()], placement);
    await settle();
    expect(states()).toEqual(["failed", "uploading", "uploading", "uploading"]);
    expect(queue.rows()[0].error).toMatchObject({ kind: "duplicate" });
  });

  it("neverReadyBeforeServerReady: an accepted upload is processing, never ready", async () => {
    const { queue, finishUploads, states } = setup();
    queue.add([file()], placement);
    await settle();
    finishUploads();
    await settle();
    expect(states()).toEqual(["processing"]);
    expect(queue.rows()[0].mediaId).toBe("M1");
  });

  it("a new uploadKey for every new photo, also for 'Upload again'", async () => {
    const { queue, createReplies, creates } = setup();
    createReplies.push(http(409, "MEDIA_UPLOAD_EXPIRED"));
    queue.add([file()], placement);
    await settle();
    queue.againAsNew(queue.rows()[0].id);
    await settle();
    expect(creates.map((input) => input.uploadKey)).toEqual(["K1", "K2"]);
  });

  it("limitPending_queues: a 409 MEDIA_LIMIT_REACHED on pending waits and creates again with the same key", async () => {
    const { queue, createReplies, creates, states } = setup();
    createReplies.push(http(409, "MEDIA_LIMIT_REACHED", "pending"));
    queue.add([file()], placement);
    await settle();
    expect(states()).toEqual(["queued"]);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(creates.map((input) => input.uploadKey)).toEqual(["K1", "K1"]);
    expect(states()).toEqual(["uploading"]);
  });

  it("limit selected fails the file (100 photos)", async () => {
    const { queue, createReplies, states } = setup();
    createReplies.push(http(409, "MEDIA_LIMIT_REACHED", "selected"));
    queue.add([file()], placement);
    await settle();
    expect(states()).toEqual(["failed"]);
  });

  it("bodies429_queues: a 429 bodies on the PUT waits for Retry-After and sends again", async () => {
    const { queue, uploadReplies, uploads, states } = setup();
    uploadReplies.push(http(429, "RATE_LIMITED", "bodies", 7) as UploadResult);
    queue.add([file()], placement);
    await settle();
    expect(states()).toEqual(["queued"]);
    await vi.advanceTimersByTimeAsync(6_999);
    expect(uploads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(uploads).toHaveLength(2);
  });

  it("expensive429_holdsForHour: the whole queue holds until Retry-After, then goes on", async () => {
    const { queue, uploadReplies, uploads, creates } = setup();
    uploadReplies.push(http(429, "RATE_LIMITED", "expensive", 3_600) as UploadResult);
    queue.add([file()], placement);
    await settle();
    expect(queue.hold()).toMatchObject({ kind: "expensive", until: 3_600_000 });
    queue.add([file()], placement);
    await vi.advanceTimersByTimeAsync(3_599_000);
    expect(uploads).toHaveLength(1);
    expect(creates).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(queue.hold()).toBeNull();
    expect(uploads.length).toBeGreaterThanOrEqual(2);
  });

  it("intakePaused_holdsReadsRetries: a 503 MEDIA_INTAKE_PAUSED holds, reads the list and retries later", async () => {
    const { queue, createReplies, creates, lists } = setup();
    createReplies.push(http(503, "MEDIA_INTAKE_PAUSED", undefined, 30));
    lists.push(null);
    queue.add([file()], placement);
    await settle();
    expect(queue.hold()).toMatchObject({ kind: "intake-paused", until: 30_000 });
    expect(lists).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(creates.map((input) => input.uploadKey)).toEqual(["K1", "K1"]);
  });

  it("readOnly_stopsAndRereads: a 409 CHECKLIST_READ_ONLY stops every file not sent and asks for a checklist read", async () => {
    const { queue, createReplies, pageFailures, states } = setup();
    createReplies.push(http(409, "CHECKLIST_READ_ONLY"));
    queue.add([file(), file(), file(), file()], placement);
    await settle();
    expect(pageFailures).toEqual(["read-only"]);
    expect(queue.stopped()).toBe(true);
    expect(states().filter((state) => state === "stopped").length).toBeGreaterThanOrEqual(2);
    expect(queue.running()).toBe(false);
  });

  it("takeover required stops the queue the same way", async () => {
    const { queue, createReplies, pageFailures } = setup();
    createReplies.push(http(409, "CHECKLIST_TAKEOVER_REQUIRED"));
    queue.add([file()], placement);
    await settle();
    expect(pageFailures).toEqual(["takeover-required"]);
    expect(queue.stopped()).toBe(true);
  });

  it("networkErrorOnPut_readsListResendsOnlyIfAwaiting_backoff: 5, 15, 45 s, then 'Try again later'", async () => {
    const { queue, uploadReplies, uploads, lists, states } = setup();
    const awaiting = listWith({ id: "M1", status: "AWAITING_CONTENT" });
    for (let index = 0; index < 4; index += 1) {
      uploadReplies.push({ ok: false, kind: "network" });
      lists.push(awaiting);
    }
    queue.add([file()], placement);
    await settle();
    expect(states()).toEqual(["retrying"]);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(uploads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(uploads).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(uploads).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(uploads).toHaveLength(4);
    expect(states()).toEqual(["failed"]);
    expect(queue.rows()[0]).toMatchObject({ giveUp: true });
  });

  it("networkErrorOnPut_readsListResendsOnlyIfAwaiting_backoff: no resend when the server got the bytes", async () => {
    const { queue, uploadReplies, uploads, lists, states } = setup();
    uploadReplies.push({ ok: false, kind: "network" });
    lists.push(listWith({ id: "M1", status: "PROCESSING" }));
    queue.add([file()], placement);
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(uploads).toHaveLength(1);
    expect(states()).toEqual(["processing"]);
  });

  it("an expired photo after a lost connection needs a new upload", async () => {
    const { queue, uploadReplies, lists, states } = setup();
    uploadReplies.push({ ok: false, kind: "network" });
    lists.push(listWith({ id: "M1", status: "UPLOAD_EXPIRED" }));
    queue.add([file()], placement);
    await settle();
    expect(states()).toEqual(["failed"]);
    expect(queue.rows()[0].error).toMatchObject({ kind: "upload-again" });
  });

  it("a busy server keeps the file queued and tries again after Retry-After", async () => {
    const { queue, uploadReplies, uploads, states } = setup();
    uploadReplies.push(http(503, "MEDIA_SERVER_BUSY", undefined, 4) as UploadResult);
    queue.add([file()], placement);
    await settle();
    expect(states()).toEqual(["queued"]);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(uploads).toHaveLength(2);
  });

  it("a create replay that already has the bytes does not upload again", async () => {
    const { queue, createReplies, uploads, states } = setup();
    createReplies.push(created("M9", "PROCESSING"));
    queue.add([file()], placement);
    await settle();
    expect(uploads).toHaveLength(0);
    expect(states()).toEqual(["processing"]);
  });

  it("a 404 is the page's failure (it leaves) and stops the queue", async () => {
    const { queue, createReplies, pageFailures } = setup();
    createReplies.push(http(404, "NOT_FOUND"));
    queue.add([file()], placement);
    await settle();
    expect(pageFailures).toEqual(["not-found"]);
    expect(queue.stopped()).toBe(true);
  });

  it("cancel aborts a running upload; dispose aborts everything", async () => {
    const { queue, uploads } = setup();
    queue.add([file(), file()], placement);
    await settle();
    queue.cancel(queue.rows()[0].id);
    expect(uploads[0].signal?.aborted).toBe(true);
    expect(queue.running()).toBe(true);
    queue.dispose();
    expect(uploads[1].signal?.aborted).toBe(true);
    expect(queue.running()).toBe(false);
  });

  it("a disposed queue takes no files (the page makes a new queue when it mounts again)", async () => {
    const { queue, creates } = setup();
    queue.dispose();
    queue.add([file()], placement);
    await settle();
    expect(creates).toHaveLength(0);
  });

  it("reports progress on its row", async () => {
    const { queue, uploads } = setup();
    queue.add([file(100)], placement);
    await settle();
    uploads[0].onProgress?.(40, 100);
    expect(queue.rows()[0].progress).toEqual({ sent: 40, total: 100 });
  });
});

describe("upload queue recovery (review fixes: the server record of a row)", () => {
  it("retry_resendsSameMediaWithoutNewCreate: 'Try again' after 'Try again later' sends the bytes of the same photo", async () => {
    const { queue, uploadReplies, uploads, creates, lists, states } = setup();
    const awaiting = listWith({ id: "M1", status: "AWAITING_CONTENT" });
    for (let index = 0; index < 4; index += 1) {
      uploadReplies.push({ ok: false, kind: "network" });
      lists.push(awaiting);
    }
    queue.add([file()], placement);
    await vi.advanceTimersByTimeAsync(70_000);
    expect(states()).toEqual(["failed"]);
    queue.retry(queue.rows()[0].id);
    await settle();
    expect(creates).toHaveLength(1);
    expect(uploads).toHaveLength(5);
    expect(uploads[4].mediaId).toBe("M1");
  });

  it("cancelAfterCreate_discardsRecord: a cancelled row's own record awaiting content is given back", async () => {
    const { queue, discarded } = setup();
    queue.add([file()], placement);
    await settle();
    queue.cancel(queue.rows()[0].id);
    expect(discarded).toEqual(["M1"]);
  });

  it("cancelDuringCreate_discardsLateRecord: a create answering after the cancel is given back, never uploaded", async () => {
    const { queue, createReplies, uploads, discarded } = setup();
    let answer!: (reply: Reply<MediaCreated>) => void;
    createReplies.push(new Promise((resolve) => (answer = resolve)));
    queue.add([file()], placement);
    await settle();
    queue.cancel(queue.rows()[0].id);
    answer(created("M7"));
    await settle();
    expect(discarded).toEqual(["M7"]);
    expect(uploads).toHaveLength(0);
  });

  it("a stop (read-only) or a processing row gives nothing back", async () => {
    const { queue, createReplies, discarded, finishUploads } = setup();
    queue.add([file()], placement);
    await settle();
    finishUploads();
    await settle();
    queue.cancel(queue.rows()[0].id);
    createReplies.push(http(409, "CHECKLIST_READ_ONLY"));
    queue.add([file()], placement);
    await settle();
    expect(discarded).toEqual([]);
  });

  it("fileAboveMaxFileBytes_failsWithoutHashOrCreate: the server's announced limit refuses it locally", async () => {
    const { queue, creates, hashed, states, setMaxFileBytes } = setup();
    setMaxFileBytes(20);
    queue.add([file(21), file(20)], placement);
    await settle();
    expect(states()).toEqual(["failed", "uploading"]);
    expect(queue.rows()[0].error).toEqual({ kind: "too-large" });
    expect(hashed).toEqual([20]);
    expect(creates).toHaveLength(1);
  });
});
