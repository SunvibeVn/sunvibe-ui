import { describe, expect, it, vi } from "vitest";

import { COOKIE_LOCK_NAME, withCookieLock } from "./cookie-lock";

describe("cookie lock (W10-25)", () => {
  it("withCookieLock_usesTheNamedLock", async () => {
    const events: string[] = [];
    const locks = {
      request: vi.fn(async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
        events.push(`lock:${name}`);
        const value = await callback();
        events.push("release");
        return value;
      }),
    };
    const result = await withCookieLock(async () => {
      events.push("task");
      return 42;
    }, locks);
    expect(result).toBe(42);
    expect(COOKIE_LOCK_NAME).toBe("sv-auth-cookie");
    expect(locks.request).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["lock:sv-auth-cookie", "task", "release"]);
  });

  it("withCookieLock_withoutLocks_runsDirectly", async () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true, writable: true });
    try {
      await expect(withCookieLock(async () => "done")).resolves.toBe("done");
    } finally {
      if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
      else Reflect.deleteProperty(globalThis, "navigator");
    }
  });

  it("withCookieLock_resolvesTheBrowserLockAtCallTime", async () => {
    const request = vi.fn(async <T>(_name: string, callback: () => Promise<T>) => callback());
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", { value: { locks: { request } }, configurable: true, writable: true });
    try {
      await expect(withCookieLock(async () => 7)).resolves.toBe(7);
      expect(request).toHaveBeenCalledWith("sv-auth-cookie", expect.any(Function));
    } finally {
      if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
      else Reflect.deleteProperty(globalThis, "navigator");
    }
  });
});
