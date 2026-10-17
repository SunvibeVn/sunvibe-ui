import { describe, expect, it, vi } from "vitest";

import { isLogoutPending } from "./browser-cookies";
import { startBrowserSession } from "./browser-session";
import type { SessionApi } from "./session-api";

type LogoutResult = Awaited<ReturnType<SessionApi["logout"]>>;
type Listener = (event: Event) => void;

class FakeJar {
  private readonly store = new Map<string, string>();

  get cookie(): string {
    return [...this.store].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  set cookie(raw: string) {
    const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
    const separator = pair.indexOf("=");
    const expired = attributes.some((attribute) => attribute.toLowerCase() === "max-age=0");
    if (expired) this.store.delete(pair.slice(0, separator));
    else this.store.set(pair.slice(0, separator), pair.slice(separator + 1));
  }

  put(name: string, value: string): void {
    this.store.set(name, value);
  }
}

class FakeTarget {
  readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  count(): number {
    return [...this.listeners.values()].reduce((total, set) => total + set.size, 0);
  }
}

class FakeDocument extends FakeTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const success: LogoutResult = { ok: true, data: undefined, status: 204, replayed: false };

function setup({ pending = true }: { pending?: boolean } = {}) {
  const jar = new FakeJar();
  if (pending) jar.put("sv_logout_pending", "1");
  const answer = deferred<LogoutResult>();
  const logout = vi.fn(() => answer.promise);
  const refreshUnlocked = vi.fn();
  const store = { getSnapshot: vi.fn(), generation: vi.fn(() => null), resetLocal: vi.fn() };
  const channel = new FakeTarget();
  const win = new FakeTarget();
  const doc = new FakeDocument();
  const deps = { api: { logout, refreshUnlocked }, store, jar, channel, win, doc, resetPrivateViews: vi.fn() };
  return { jar, answer, logout, refreshUnlocked, channel, win, doc, deps };
}

describe("startBrowserSession", () => {
  it("pendingFlag_sendsTheLogoutAndStartsTheSync", async () => {
    const t = setup();
    const stop = startBrowserSession(t.deps);
    expect(t.logout).toHaveBeenCalledTimes(1);
    expect(t.channel.count() + t.win.count() + t.doc.count()).toBeGreaterThan(0);
    t.answer.resolve(success);
    await vi.waitFor(() => expect(isLogoutPending(t.jar)).toBe(false));
    expect(t.refreshUnlocked).not.toHaveBeenCalled();
    stop();
  });

  it("noFlag_sendsNothing", () => {
    const t = setup({ pending: false });
    const stop = startBrowserSession(t.deps);
    expect(t.logout).not.toHaveBeenCalled();
    stop();
  });

  it("secondStartWhileInFlight_sendsOneRequest", async () => {
    const t = setup();
    const stopFirst = startBrowserSession(t.deps);
    stopFirst();
    const stopSecond = startBrowserSession(t.deps);
    expect(t.logout).toHaveBeenCalledTimes(1);
    t.answer.resolve(success);
    await vi.waitFor(() => expect(isLogoutPending(t.jar)).toBe(false));
    expect(t.logout).toHaveBeenCalledTimes(1);
    stopSecond();
  });

  it("returnsTheSyncCleanup", () => {
    const t = setup({ pending: false });
    const stop = startBrowserSession(t.deps);
    expect(t.win.count() + t.doc.count() + t.channel.count()).toBeGreaterThan(0);
    stop();
    expect(t.win.count() + t.doc.count() + t.channel.count()).toBe(0);
  });
});
