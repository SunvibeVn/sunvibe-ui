import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMediaPoller, type PollResult } from "./media-polling";

function setup(initial: { pending: boolean; visible?: boolean }) {
  const state = { pending: initial.pending, visible: initial.visible ?? true };
  const reads: number[] = [];
  let next: PollResult = { kind: "applied" };
  const poller = createMediaPoller({
    read: async () => {
      reads.push(Date.now());
      const result = next;
      next = { kind: "applied" };
      return result;
    },
    isPending: () => state.pending,
    isVisible: () => state.visible,
    now: () => Date.now(),
  });
  return {
    state,
    reads,
    poller,
    answerNext: (result: PollResult) => {
      next = result;
    },
    readsBetween: (from: number, to: number) => reads.filter((at) => at > from && at <= to).length,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("media polling (survey-media spec 6.2 Polling)", () => {
  it("polls every 3 s while photos are pending, then every 15 s after 2 minutes", async () => {
    const { reads, poller, readsBetween } = setup({ pending: true });
    poller.start();
    poller.readNow();
    await vi.advanceTimersByTimeAsync(30_000);
    // The first read at once, then every 3 s.
    expect(readsBetween(-1, 30_000)).toBe(11);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(readsBetween(120_000, 150_000)).toBe(2);
    expect(reads.at(-1)).toBe(150_000);
    poller.stop();
  });

  it("window_notRestartedByLaterUploads", async () => {
    const { poller, readsBetween } = setup({ pending: true });
    poller.start();
    await vi.advanceTimersByTimeAsync(60_000);
    // Another upload starts while the first ones are pending: the window still ends 2 minutes after the first.
    poller.refresh();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(readsBetween(120_000, 150_000)).toBe(2);
    poller.stop();
  });

  it("a new window starts when photos are pending again after an idle time", async () => {
    const { state, poller, readsBetween } = setup({ pending: true });
    poller.start();
    await vi.advanceTimersByTimeAsync(150_000);
    state.pending = false;
    await vi.advanceTimersByTimeAsync(60_000);
    state.pending = true;
    poller.refresh();
    const from = Date.now();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(readsBetween(from, from + 30_000)).toBe(10);
    poller.stop();
  });

  it("idle60sWhileVisible: every 60 s while visible and nothing is pending", async () => {
    const { poller, readsBetween } = setup({ pending: false });
    poller.start();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(readsBetween(0, 59_999)).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(readsBetween(0, 60_000)).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(readsBetween(60_000, 180_000)).toBe(2);
    poller.stop();
  });

  it("idle60sWhileVisible: no idle poll while the page is hidden", async () => {
    const { poller, reads } = setup({ pending: false, visible: false });
    poller.start();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(reads).toHaveLength(0);
    poller.stop();
  });

  it("visibilitychange_reads: becoming visible reads at once", async () => {
    const { state, poller, reads } = setup({ pending: false, visible: false });
    poller.start();
    await vi.advanceTimersByTimeAsync(10_000);
    state.visible = true;
    poller.onVisibilityChange();
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toEqual([10_000]);
    poller.stop();
  });

  it("pageshowPersisted_reads: a page restored from the bfcache reads at once", async () => {
    const { poller, reads } = setup({ pending: false });
    poller.start();
    await vi.advanceTimersByTimeAsync(5_000);
    poller.onPageShow(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toHaveLength(0);
    poller.onPageShow(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toEqual([5_000]);
    poller.stop();
  });

  it("429_keepsListWaitsRetryAfter: the next poll waits for Retry-After", async () => {
    const { poller, reads, answerNext } = setup({ pending: true });
    answerNext({ kind: "rate-limited", retryAfterSeconds: 30 });
    poller.start();
    poller.readNow();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(reads).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    expect(reads).toEqual([0, 30_000]);
    // A visibility change during the wait does not read before Retry-After either.
    answerNext({ kind: "rate-limited", retryAfterSeconds: 20 });
    await vi.advanceTimersByTimeAsync(3_000);
    poller.onVisibilityChange();
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toEqual([0, 30_000, 33_000]);
    poller.stop();
  });

  it("stop ends polling and never reads twice at once", async () => {
    const { poller, reads } = setup({ pending: true });
    poller.start();
    poller.readNow();
    poller.readNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toEqual([0]);
    poller.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reads).toEqual([0]);
  });
});

describe("media polling while bytes are moving (review fix: a refresh never postpones an armed poll)", () => {
  it("progress events every 50 ms for 10 s still poll every 3 s", async () => {
    const { poller, reads } = setup({ pending: true });
    poller.start();
    poller.readNow();
    for (let elapsed = 0; elapsed < 10_000; elapsed += 50) {
      poller.refresh();
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(reads.length).toBeGreaterThanOrEqual(4);
    poller.stop();
  });

  it("a refresh that needs an earlier poll moves it forward", async () => {
    const { state, poller, reads } = setup({ pending: false });
    poller.start();
    await vi.advanceTimersByTimeAsync(10_000);
    state.pending = true;
    poller.refresh();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(reads).toEqual([13_000]);
    poller.stop();
  });
});
