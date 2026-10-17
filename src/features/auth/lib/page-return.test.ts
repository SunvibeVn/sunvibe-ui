import { describe, expect, it, vi } from "vitest";
import { subscribePageReturn } from "./page-return";

class FakeTarget {
  readonly listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, listener: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  count(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}

describe("subscribePageReturn (a step page hidden by the router reads its progress again)", () => {
  it("pageReturn_pageshowPopstateVisibilityOrFocus_notifies", () => {
    const win = new FakeTarget();
    const doc = new FakeTarget();
    const notify = vi.fn();
    subscribePageReturn({ window: win, document: doc }, notify);
    win.fire("pageshow");
    // App Router Back is a popstate: none of the other events fires for it.
    win.fire("popstate");
    doc.fire("visibilitychange");
    win.fire("focus");
    expect(notify).toHaveBeenCalledTimes(4);
  });

  it("pageReturn_unsubscribe_removesEveryListener", () => {
    const win = new FakeTarget();
    const doc = new FakeTarget();
    const notify = vi.fn();
    const unsubscribe = subscribePageReturn({ window: win, document: doc }, notify);
    expect(win.count() + doc.count()).toBe(4);
    unsubscribe();
    expect(win.count() + doc.count()).toBe(0);
    win.fire("pageshow");
    win.fire("popstate");
    doc.fire("visibilitychange");
    win.fire("focus");
    expect(notify).not.toHaveBeenCalled();
  });
});
