import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthMessage } from "./auth-channel";
import { readHint } from "./browser-cookies";
import type { SessionApi, SessionResponse } from "./session-api";
import { createSessionStore, type SessionStore } from "./session-store";
import { createResetPrivateViews, startSessionSync } from "./session-sync";

/** Minimal `document.cookie` model: the setter takes one cookie string, the getter returns `name=value` pairs. */
class FakeJar {
  readonly writes: string[] = [];
  private readonly store = new Map<string, string>();

  get cookie(): string {
    return [...this.store].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  set cookie(raw: string) {
    this.writes.push(raw);
    const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (attributes.some((attribute) => attribute.toLowerCase() === "max-age=0")) this.store.delete(name);
    else this.store.set(name, value);
  }

  /** Test setup (another tab or the server changing the cookies): not recorded as a write. */
  put(name: string, value: string | null): void {
    if (value === null) this.store.delete(name);
    else this.store.set(name, value);
  }
}

type Listener = (event: Event) => void;

/** An event target that records its listeners, so a test can dispatch and check the cleanup. */
class FakeTarget {
  readonly listeners = new Map<string, Set<Listener>>();
  readonly posted: unknown[] = [];

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  dispatch(type: string, event: Event = new Event(type)): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  count(): number {
    return [...this.listeners.values()].reduce((total, set) => total + set.size, 0);
  }
}

class FakeDocument extends FakeTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

const message = (data: unknown): Event => new MessageEvent("message", { data });
const pageshow = (persisted: boolean): Event => Object.assign(new Event("pageshow"), { persisted });

function session(userId = "u1"): SessionResponse {
  return {
    accessToken: "at-1",
    expiresIn: 900,
    tokenType: "Bearer",
    user: {
      userId,
      fullName: "Nguyen Van A",
      username: "0901234567",
      email: "a@example.com",
      roles: ["CUSTOMER"],
      phoneVerified: true,
      emailVerified: false,
    },
  };
}

type RefreshResult = Awaited<ReturnType<SessionApi["refreshUnlocked"]>>;

function newStore(jar: FakeJar, broadcast: (message: AuthMessage) => void = vi.fn()) {
  return createSessionStore({
    api: {
      refreshUnlocked: async (): Promise<RefreshResult> => {
        throw new Error("unexpected refresh");
      },
      logoutUnlocked: async () => {
        throw new Error("unexpected logout");
      },
    },
    jar,
    now: () => 0,
    sleep: async () => undefined,
    lock: (task) => task(),
    broadcast,
    onIdentityChange: vi.fn(),
  });
}

/** Timers the test runs by hand. */
function fakeTimers() {
  let nextId = 1;
  const pending = new Map<number, { run: () => void; ms: number }>();
  return {
    pending,
    set(run: () => void, ms: number): number {
      const id = nextId++;
      pending.set(id, { run, ms });
      return id;
    },
    clear(id: number): void {
      pending.delete(id);
    },
    runAll(): void {
      const due = [...pending.values()];
      pending.clear();
      for (const timer of due) timer.run();
    },
  };
}

type Setup = { signedIn?: boolean; hint?: string | null; channel?: boolean };

function setup({ signedIn = true, hint = null, channel = true }: Setup = {}) {
  const jar = new FakeJar();
  if (hint) jar.put("sv_signed_in", hint);
  const broadcast = vi.fn();
  const store: SessionStore = newStore(jar, broadcast);
  if (signedIn) store.adopt(session(), { newSignIn: true });
  // The sign-in above broadcast once; from here on only the sync runs.
  broadcast.mockClear();
  const bound = store.generation();
  const writesBefore = jar.writes.length;
  const fakeChannel = channel ? new FakeTarget() : null;
  const win = new FakeTarget();
  const doc = new FakeDocument();
  const timers = fakeTimers();
  const resetPrivateViews = vi.fn();
  const stop = startSessionSync({ store, jar, channel: fakeChannel, win, doc, resetPrivateViews, timers });
  return {
    jar,
    store,
    bound,
    channel: fakeChannel,
    win,
    doc,
    timers,
    resetPrivateViews,
    stop,
    /** The sync changes only this tab's memory: no cookie write, no broadcast by the store, nothing posted. */
    expectLocalOnly(): void {
      expect(jar.writes.slice(writesBefore)).toEqual([]);
      expect(broadcast).not.toHaveBeenCalled();
      expect(fakeChannel?.posted ?? []).toEqual([]);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session sync (W10-28, W10-29, W10-42, W10-45)", () => {
  it("message_signedOut_signsThisTabOutAndResets", () => {
    const t = setup();
    expect(t.store.getSnapshot().status).toBe("signed-in");
    t.jar.put("sv_signed_in", null); // another tab signed out

    t.channel?.dispatch("message", message({ type: "signed-out", generation: null }));

    expect(t.store.getSnapshot()).toMatchObject({ status: "signed-out", user: null });
    expect(t.store.generation()).toBeNull();
    expect(t.resetPrivateViews).toHaveBeenCalledTimes(1);
    expect(t.resetPrivateViews).toHaveBeenCalledWith("signed-out");
    // The other tab already wrote the cookies and told everyone.
    t.expectLocalOnly();
  });

  it("pageshowPersisted_hintGone_resetsBeforeShowing", () => {
    const t = setup();
    t.jar.put("sv_signed_in", null);

    t.win.dispatch("pageshow", pageshow(false));
    expect(t.resetPrivateViews).not.toHaveBeenCalled();

    t.win.dispatch("pageshow", pageshow(true));
    // Synchronously inside the handler, before the restored page is used.
    expect(t.store.getSnapshot().status).toBe("signed-out");
    expect(t.resetPrivateViews).toHaveBeenCalledTimes(1);
    expect(t.resetPrivateViews).toHaveBeenCalledWith("signed-out");
    t.expectLocalOnly();
  });

  it("visibilityVisible_otherGeneration_resets", () => {
    const t = setup();
    expect(t.bound).not.toBeNull();
    t.jar.put("sv_signed_in", "gen-other"); // a new sign-in in another tab of this browser

    t.doc.visibilityState = "visible";
    t.doc.dispatch("visibilitychange");

    expect(t.store.getSnapshot()).toMatchObject({ status: "restoring", user: null });
    expect(t.store.generation()).toBeNull();
    expect(t.resetPrivateViews).toHaveBeenCalledTimes(1);
    expect(t.resetPrivateViews).toHaveBeenCalledWith("other-sign-in");
    // The hint of the new sign-in is kept for the next restore.
    expect(readHint(t.jar)).toBe("gen-other");
    t.expectLocalOnly();
  });

  it("message_carriesOnlyTypeAndGeneration", async () => {
    class FakeChannel extends FakeTarget {
      static created: FakeChannel[] = [];
      constructor(readonly name: string) {
        super();
        FakeChannel.created.push(this);
      }
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    vi.resetModules();
    const { broadcastAuth } = await import("./auth-channel");
    const jar = new FakeJar();
    const store = newStore(jar, broadcastAuth);

    store.adopt(session(), { newSignIn: true });
    store.endLocally("signed-out");

    const posted = FakeChannel.created[0]?.posted ?? [];
    expect(posted).toEqual([
      { type: "signed-in", generation: expect.any(String) },
      { type: "signed-out", generation: null },
    ]);
    for (const sent of posted) expect(Object.keys(sent as object).sort()).toEqual(["generation", "type"]);
  });

  it("message_forgedSignOut_hintStillValid_changesNothing", () => {
    const t = setup();

    t.channel?.dispatch("message", message({ type: "signed-out", generation: "gen-x", accessToken: "secret" }));
    t.timers.runAll();

    expect(t.store.getSnapshot().status).toBe("signed-in");
    expect(t.store.generation()).toBe(t.bound);
    expect(t.resetPrivateViews).not.toHaveBeenCalled();
  });

  it("message_reassuringContent_hintGone_stillResets", () => {
    const t = setup();
    t.jar.put("sv_signed_in", null);

    t.channel?.dispatch("message", message({ type: "signed-in", generation: t.bound, accessToken: "x" }));

    expect(t.store.getSnapshot().status).toBe("signed-out");
    expect(t.resetPrivateViews).toHaveBeenCalledTimes(1);
    expect(t.resetPrivateViews).toHaveBeenCalledWith("signed-out");
    t.expectLocalOnly();
  });

  it("message_cookieLagsTheMessage_reconcilesAgainAfter250ms", () => {
    const t = setup();
    // The message arrives before this renderer sees the other tab's cookie change.
    t.channel?.dispatch("message", message({ type: "signed-out", generation: null }));
    expect(t.resetPrivateViews).not.toHaveBeenCalled();
    expect([...t.timers.pending.values()].map((timer) => timer.ms)).toEqual([250]);

    t.jar.put("sv_signed_in", null);
    t.timers.runAll();

    expect(t.store.getSnapshot().status).toBe("signed-out");
    expect(t.resetPrivateViews).toHaveBeenCalledTimes(1);
    expect(t.resetPrivateViews).toHaveBeenCalledWith("signed-out");
    t.expectLocalOnly();
  });

  it("message_burst_keepsOneFollowUp", () => {
    const t = setup();

    t.channel?.dispatch("message", message({ type: "signed-out", generation: null }));
    t.channel?.dispatch("message", message({ type: "signed-out", generation: null }));

    expect(t.timers.pending.size).toBe(1);
  });

  it("noBroadcastChannel_stillReconcilesOnFocus", () => {
    const t = setup({ channel: false });
    t.jar.put("sv_signed_in", null);

    t.win.dispatch("focus");

    expect(t.store.getSnapshot().status).toBe("signed-out");
    expect(t.resetPrivateViews).toHaveBeenCalledTimes(1);
    expect(t.resetPrivateViews).toHaveBeenCalledWith("signed-out");
    t.expectLocalOnly();
  });

  it("logoutPending_countsAsHintGone", () => {
    const t = setup();
    t.jar.put("sv_logout_pending", "1"); // another tab started a logout; the hint is still there

    t.win.dispatch("focus");

    expect(t.store.getSnapshot().status).toBe("signed-out");
    expect(t.resetPrivateViews).toHaveBeenCalledWith("signed-out");
    t.expectLocalOnly();
  });

  it("signedOutTab_otherTabSignsIn_refreshesHeader", () => {
    const t = setup({ signedIn: false });
    expect(t.store.getSnapshot().status).toBe("signed-out");
    t.jar.put("sv_signed_in", "gen-2"); // another tab signed in

    t.channel?.dispatch("message", message({ type: "signed-in", generation: "gen-2" }));
    t.timers.runAll();
    t.win.dispatch("focus");

    expect(t.store.getSnapshot().status).toBe("restoring");
    expect(t.store.generation()).toBeNull();
    expect(t.resetPrivateViews).toHaveBeenCalledTimes(1);
    expect(t.resetPrivateViews).toHaveBeenCalledWith("other-sign-in");
    t.expectLocalOnly();
  });

  // A public page renders its header on the server and may never read the store: the sync pins the state the page
  // was opened with when it starts, so a later cookie change is seen as a change.
  it("untouchedStore_otherTabSignsOut_refreshesHeader", () => {
    const t = setup({ signedIn: false, hint: "gen-1" }); // no getSnapshot() before the sync starts
    t.jar.put("sv_signed_in", null); // another tab logged out

    t.channel?.dispatch("message", message({ type: "signed-out", generation: null }));

    expect(t.store.getSnapshot().status).toBe("signed-out");
    expect(t.resetPrivateViews).toHaveBeenCalledTimes(1);
    expect(t.resetPrivateViews).toHaveBeenCalledWith("signed-out");
    t.expectLocalOnly();
  });

  it("untouchedStore_otherTabSignsIn_refreshesHeader", () => {
    const t = setup({ signedIn: false }); // no hint and no getSnapshot() before the sync starts
    t.jar.put("sv_signed_in", "gen-2"); // another tab signed in

    t.channel?.dispatch("message", message({ type: "signed-in", generation: "gen-2" }));

    expect(t.store.getSnapshot().status).toBe("restoring");
    expect(t.resetPrivateViews).toHaveBeenCalledTimes(1);
    expect(t.resetPrivateViews).toHaveBeenCalledWith("other-sign-in");
    t.expectLocalOnly();
  });

  it("restoringTab_newHint_doesNothing", () => {
    const t = setup({ signedIn: false, hint: "gen-1" });
    expect(t.store.getSnapshot().status).toBe("restoring");
    t.jar.put("sv_signed_in", "gen-2");

    t.channel?.dispatch("message", message({ type: "signed-in", generation: "gen-2" }));
    t.timers.runAll();
    t.win.dispatch("focus");

    // Nothing bound yet: the lazy restore picks up whichever hint is current.
    expect(t.store.getSnapshot().status).toBe("restoring");
    expect(t.resetPrivateViews).not.toHaveBeenCalled();
  });

  // Final review M-1: the sync leaves a restoring tab alone, so the store itself restores the newer sign-in.
  it("restoringTab_restoreInFlight_otherTabSignsIn_getsTheNewSignIn", async () => {
    const jar = new FakeJar();
    jar.put("sv_signed_in", "gen-1");
    let releaseLock!: () => void;
    const lockFree = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const refreshUnlocked = vi.fn(async (): Promise<RefreshResult> => ({
      ok: true,
      data: { ...session("u2"), accessToken: "at-2" },
      status: 200,
      replayed: false,
    }));
    const store = createSessionStore({
      api: { refreshUnlocked, logoutUnlocked: vi.fn() },
      jar,
      now: () => 0,
      sleep: async () => undefined,
      // Another tab's login holds the cookie lock until it has written its hint.
      lock: async (task) => {
        await lockFree;
        return task();
      },
      broadcast: vi.fn(),
      onIdentityChange: vi.fn(),
    });
    const channel = new FakeTarget();
    const resetPrivateViews = vi.fn();
    const stop = startSessionSync({
      store,
      jar,
      channel,
      win: new FakeTarget(),
      doc: new FakeDocument(),
      resetPrivateViews,
      timers: fakeTimers(),
    });
    const token = store.getAccessToken();
    jar.put("sv_signed_in", "gen-2");
    channel.dispatch("message", message({ type: "signed-in", generation: "gen-2" }));
    releaseLock();

    await expect(token).resolves.toBe("at-2");
    expect(store.getSnapshot().status).toBe("signed-in");
    expect(store.generation()).toBe("gen-2");
    expect(resetPrivateViews).not.toHaveBeenCalled();
    stop();
  });

  it("alreadySignedOut_doesNotResetAgain", () => {
    const t = setup({ signedIn: false });
    expect(t.store.getSnapshot().status).toBe("signed-out");

    t.win.dispatch("focus");
    t.channel?.dispatch("message", message({ type: "signed-out", generation: null }));
    t.timers.runAll();
    t.win.dispatch("pageshow", pageshow(true));

    expect(t.resetPrivateViews).not.toHaveBeenCalled();
  });

  it("sameGeneration_doesNothing", () => {
    const t = setup();

    t.win.dispatch("focus");
    t.doc.dispatch("visibilitychange");
    t.win.dispatch("pageshow", pageshow(true));

    expect(t.store.getSnapshot().status).toBe("signed-in");
    expect(t.store.generation()).toBe(t.bound);
    expect(t.resetPrivateViews).not.toHaveBeenCalled();
  });

  it("visibilityHidden_doesNothing", () => {
    const t = setup();
    t.jar.put("sv_signed_in", null);

    t.doc.visibilityState = "hidden";
    t.doc.dispatch("visibilitychange");

    expect(t.store.getSnapshot().status).toBe("signed-in");
    expect(t.resetPrivateViews).not.toHaveBeenCalled();
  });

  it("cleanup_removesEveryListenerAndThePendingTimer", () => {
    const t = setup();
    expect(t.channel?.count()).toBe(1);
    expect(t.win.count()).toBe(2);
    expect(t.doc.count()).toBe(1);
    t.channel?.dispatch("message", message({ type: "signed-out", generation: null }));
    expect(t.timers.pending.size).toBe(1);

    t.stop();

    expect(t.channel?.count()).toBe(0);
    expect(t.win.count()).toBe(0);
    expect(t.doc.count()).toBe(0);
    expect(t.timers.pending.size).toBe(0);
    t.jar.put("sv_signed_in", null);
    t.win.dispatch("focus");
    expect(t.resetPrivateViews).not.toHaveBeenCalled();
  });
});

describe("createResetPrivateViews (auth-browser-session §4.5)", () => {
  function views(pathname: string, privateViewMounted = false) {
    const replace = vi.fn();
    const reload = vi.fn();
    const refresh = vi.fn();
    const reset = createResetPrivateViews({
      location: { pathname, replace, reload },
      refresh,
      privateViewMounted: () => privateViewMounted,
    });
    return { reset, replace, reload, refresh };
  }

  // A private page kept hidden by <Activity> after a soft navigation to a public page still holds its DOM and state:
  // only a full load drops them (W10-29, W10-45).
  it("publicPath_privateViewStillMounted_reloads", () => {
    for (const reason of ["signed-out", "other-sign-in"] as const) {
      for (const path of ["/", "/login"]) {
        const v = views(path, true);
        v.reset(reason);
        expect(v.reload).toHaveBeenCalledTimes(1);
        expect(v.refresh).not.toHaveBeenCalled();
        expect(v.replace).not.toHaveBeenCalled();
      }
    }
  });

  it("protectedPath_privateViewMounted_keepsItsFullLoads", () => {
    const out = views("/account", true);
    out.reset("signed-out");
    expect(out.replace).toHaveBeenCalledWith("/login");
    expect(out.reload).not.toHaveBeenCalled();
    const other = views("/account", true);
    other.reset("other-sign-in");
    expect(other.reload).toHaveBeenCalledTimes(1);
  });

  it("protectedPath_signedOut_replacesWithLogin", () => {
    for (const path of ["/account", "/account/profile", "/verify-phone"]) {
      const v = views(path);
      v.reset("signed-out");
      expect(v.replace).toHaveBeenCalledWith("/login");
      expect(v.reload).not.toHaveBeenCalled();
      expect(v.refresh).not.toHaveBeenCalled();
    }
  });

  it("protectedPath_otherSignIn_reloads", () => {
    for (const path of ["/account", "/verify-phone"]) {
      const v = views(path);
      v.reset("other-sign-in");
      expect(v.reload).toHaveBeenCalledTimes(1);
      expect(v.replace).not.toHaveBeenCalled();
      expect(v.refresh).not.toHaveBeenCalled();
    }
  });

  it("publicPath_refreshesTheServerRenderedHeader", () => {
    for (const reason of ["signed-out", "other-sign-in"] as const) {
      for (const path of ["/", "/accounting", "/login"]) {
        const v = views(path);
        v.reset(reason);
        expect(v.refresh).toHaveBeenCalledTimes(1);
        expect(v.replace).not.toHaveBeenCalled();
        expect(v.reload).not.toHaveBeenCalled();
      }
    }
  });
});
