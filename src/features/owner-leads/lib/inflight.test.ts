import { describe, expect, it } from "vitest";

import { dedupeInflight } from "./inflight";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("dedupeInflight", () => {
  it("dedupes in-flight detail requests", async () => {
    const pending = deferred<string>();
    const calls: string[] = [];
    const load = dedupeInflight(async (id: string) => {
      calls.push(id);
      return pending.promise;
    });

    const first = load("L1");
    const second = load("L1");
    expect(calls).toEqual(["L1"]);

    pending.resolve("detail");
    await expect(first).resolves.toBe("detail");
    await expect(second).resolves.toBe("detail");

    // Settled: nothing is cached, the next call goes out again.
    const later = load("L1");
    expect(calls).toEqual(["L1", "L1"]);
    await expect(later).resolves.toBe("detail");
  });

  it("keeps one in-flight request per key", async () => {
    const calls: string[] = [];
    const load = dedupeInflight(async (id: string) => {
      calls.push(id);
      return id;
    });
    await Promise.all([load("A"), load("B"), load("A")]);
    expect(calls).toEqual(["A", "B"]);
  });

  it("clears the entry when the call rejects, and shares the rejection while it is in flight", async () => {
    const pending = deferred<string>();
    let count = 0;
    const load = dedupeInflight((id: string) => {
      void id;
      count += 1;
      return count === 1 ? pending.promise : Promise.resolve("ok");
    });

    const first = load("L1");
    const second = load("L1");
    expect(count).toBe(1);
    pending.reject(new Error("boom"));
    await expect(first).rejects.toThrow("boom");
    await expect(second).rejects.toThrow("boom");

    await expect(load("L1")).resolves.toBe("ok");
    expect(count).toBe(2);
  });

  it("clears the entry when the function throws synchronously", async () => {
    let count = 0;
    const load = dedupeInflight((id: string): Promise<string> => {
      void id;
      count += 1;
      if (count === 1) throw new Error("sync");
      return Promise.resolve("ok");
    });
    await expect(load("L1")).rejects.toThrow("sync");
    await expect(load("L1")).resolves.toBe("ok");
  });
});
