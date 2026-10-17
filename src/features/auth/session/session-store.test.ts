import { afterEach, describe, expect, it, vi } from "vitest";

import { isLogoutPending, readHint } from "./browser-cookies";
import { retryPendingLogout } from "./logout";
import type { SessionApi, SessionResponse } from "./session-api";
import { createSessionStore, type SessionStore } from "./session-store";

type RefreshResult = Awaited<ReturnType<SessionApi["refreshUnlocked"]>>;
type LogoutResult = Awaited<ReturnType<SessionApi["logoutUnlocked"]>>;

/** Minimal `document.cookie` model: the setter takes one cookie string, the getter returns `name=value` pairs. */
class FakeJar {
  readonly writes: string[] = [];
  reads = 0;
  private readonly store = new Map<string, string>();

  get cookie(): string {
    this.reads += 1;
    return [...this.store].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  set cookie(raw: string) {
    this.writes.push(raw);
    const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    const expired = attributes.some((attribute) => attribute.toLowerCase() === "max-age=0");
    if (expired) this.store.delete(name);
    else this.store.set(name, value);
  }

  /** Test setup that is not recorded as a store write. */
  put(name: string, value: string | null): void {
    if (value === null) this.store.delete(name);
    else this.store.set(name, value);
  }
}

function session(userId = "u1", accessToken = "at-1", expiresIn = 900): SessionResponse {
  return {
    accessToken,
    expiresIn,
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

const ok = (data: SessionResponse): RefreshResult => ({ ok: true, data, status: 200, replayed: false });
const httpError = (status: number, extra: { code?: string; retryAfterSeconds?: number } = {}): RefreshResult => ({
  ok: false,
  kind: "http",
  status,
  fieldErrors: [],
  ...extra,
});
const network: RefreshResult = { ok: false, kind: "network" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type SetupOptions = { hint?: string | null; pending?: boolean };

function setup({ hint = "gen-1", pending = false }: SetupOptions = {}) {
  const jar = new FakeJar();
  if (hint) jar.put("sv_signed_in", hint);
  if (pending) jar.put("sv_logout_pending", "1");
  let time = 0;
  const attemptTimes: number[] = [];
  const sleeps: number[] = [];
  let lockHeld = false;
  const heldDuringAttempt: boolean[] = [];
  const queue: Array<RefreshResult | Promise<RefreshResult> | Error> = [];
  /** Lock holds, refreshes and logouts in the order they happen. */
  const events: string[] = [];
  const logoutAnswers: Array<LogoutResult | Error> = [];

  const refreshUnlocked = vi.fn(async (): Promise<RefreshResult> => {
    events.push("refresh");
    attemptTimes.push(time);
    heldDuringAttempt.push(lockHeld);
    const next = queue.shift();
    if (next === undefined) throw new Error("unexpected refresh");
    if (next instanceof Error) throw next;
    return next;
  });
  const lockCalls = vi.fn();
  // Serializing, like Web Locks: a task waits until the previous holder is done.
  let lockTail: Promise<unknown> = Promise.resolve();
  const lock = <T>(task: () => Promise<T>): Promise<T> => {
    lockCalls();
    const run = lockTail.then(async () => {
      lockHeld = true;
      events.push("lock acquired");
      try {
        return await task();
      } finally {
        lockHeld = false;
        events.push("lock released");
      }
    });
    lockTail = run.catch(() => undefined);
    return run;
  };
  const logoutUnlocked = vi.fn(async (): Promise<LogoutResult> => {
    events.push(lockHeld ? "logout" : "logout outside the lock");
    const next = logoutAnswers.shift() ?? { ok: true, data: undefined, status: 204, replayed: false };
    if (next instanceof Error) throw next;
    return next;
  });
  const broadcast = vi.fn();
  const onIdentityChange = vi.fn();

  const store: SessionStore = createSessionStore({
    api: { refreshUnlocked, logoutUnlocked },
    jar,
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
    lock,
    broadcast,
    onIdentityChange,
  });

  return {
    store,
    jar,
    refreshUnlocked,
    logoutUnlocked,
    events,
    answerLogout: (...results: Array<LogoutResult | Error>) => logoutAnswers.push(...results),
    lockCalls,
    lock,
    broadcast,
    onIdentityChange,
    attemptTimes,
    sleeps,
    heldDuringAttempt,
    respond: (...results: Array<RefreshResult | Promise<RefreshResult> | Error>) => queue.push(...results),
    advance: (ms: number) => {
      time += ms;
    },
    setTime: (value: number) => {
      time = value;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("session store (W10-23, W10-25, W10-32, W10-33, W10-41)", () => {
  // Rule 1
  it("noHint_returnsNullWithoutRefresh", async () => {
    const t = setup({ hint: null });
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.refreshUnlocked).not.toHaveBeenCalled();
    expect(t.store.getSnapshot()).toEqual({ status: "signed-out", user: null });
  });

  it("pendingLogout_returnsNullWithoutRefresh", async () => {
    const t = setup({ pending: true });
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.refreshUnlocked).not.toHaveBeenCalled();
    expect(t.store.getSnapshot().status).toBe("signed-out");
  });

  // Rule 2
  it("concurrentCallers_shareOneRefresh", async () => {
    const t = setup();
    const answer = deferred<RefreshResult>();
    t.respond(answer.promise);
    const first = t.store.getAccessToken();
    const second = t.store.getAccessToken();
    answer.resolve(ok(session()));
    await expect(Promise.all([first, second])).resolves.toEqual(["at-1", "at-1"]);
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
  });

  // Rule 3
  it("validToken_isReusedUntil30sBeforeExpiry", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1", 900)), ok(session("u1", "at-2", 900)));
    await expect(t.store.getAccessToken()).resolves.toBe("at-1");
    t.setTime(900_000 - 30_000 - 1);
    await expect(t.store.getAccessToken()).resolves.toBe("at-1");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
    t.setTime(900_000 - 30_000);
    await expect(t.store.getAccessToken()).resolves.toBe("at-2");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
  });

  // Rule 4
  it("refresh200_signsInAndRewritesTheHint", async () => {
    const t = setup();
    t.respond(ok(session()));
    await t.store.getAccessToken();
    const snapshot = t.store.getSnapshot();
    expect(snapshot).toEqual({
      status: "signed-in",
      user: {
        userId: "u1",
        fullName: "Nguyen Van A",
        username: "0901234567",
        roles: ["CUSTOMER"],
        phoneVerified: true,
        emailVerified: false,
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain("at-1");
    expect(t.jar.writes).toEqual(["sv_signed_in=gen-1; Path=/; SameSite=Lax; Max-Age=604800"]);
    expect(t.store.generation()).toBe("gen-1");
    expect(t.broadcast).not.toHaveBeenCalled();
  });

  // Rule 5
  it("refresh401_endsAsExpiredClearsHintAndBroadcasts", async () => {
    const t = setup();
    t.respond(httpError(401, { code: "SESSION_EXPIRED" }));
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(readHint(t.jar)).toBeNull();
    expect(t.broadcast).toHaveBeenCalledTimes(1);
    expect(t.broadcast).toHaveBeenCalledWith({ type: "signed-out", generation: null });
    expect(t.store.getSnapshot()).toEqual({ status: "signed-out", user: null, endedBy: "expired" });
    expect(t.store.generation()).toBeNull();
  });

  // Rule 6
  it("refreshNetworkError_retriesAt2And12SecondsThenUnavailable", async () => {
    const t = setup();
    t.respond(network, network, network);
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.attemptTimes).toEqual([0, 2_000, 12_000]);
    expect(t.store.getSnapshot()).toEqual({ status: "unavailable", user: null });
    expect(readHint(t.jar)).toBe("gen-1");
    expect(t.broadcast).not.toHaveBeenCalled();
  });

  it("networkRetries_areTimedFromTheFirstFailure", async () => {
    const t = setup();
    t.refreshUnlocked.mockImplementation(async () => {
      t.advance(500);
      return network;
    });
    await t.store.getAccessToken();
    // first failure at 500 ms: retries start at 2 500 ms and 12 500 ms
    expect(t.sleeps).toEqual([2_000, 9_500]);
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(3);
  });

  it("networkRetry_thatSucceeds_signsIn", async () => {
    const t = setup();
    t.respond(network, ok(session()));
    await expect(t.store.getAccessToken()).resolves.toBe("at-1");
    expect(t.attemptTimes).toEqual([0, 2_000]);
    expect(t.store.getSnapshot().status).toBe("signed-in");
  });

  it("restore_takesTheCookieLockOncePerRestore", async () => {
    const t = setup();
    t.respond(network, network, network);
    await t.store.getAccessToken();
    expect(t.lockCalls).toHaveBeenCalledTimes(1);
    expect(t.heldDuringAttempt).toEqual([true, true, true]);
  });

  // Rule 7
  it("refresh429_isUnavailableWithRetryAfter", async () => {
    const t = setup();
    t.respond(httpError(429, { code: "RATE_LIMITED", retryAfterSeconds: 30 }));
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.store.getSnapshot()).toEqual({ status: "unavailable", user: null, retryAfterSeconds: 30 });
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(t.sleeps).toEqual([]);
  });

  it("refresh500_isUnavailableWithoutRetries", async () => {
    const t = setup();
    t.respond(httpError(500));
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.store.getSnapshot().status).toBe("unavailable");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(t.sleeps).toEqual([]);
    expect(readHint(t.jar)).toBe("gen-1");
  });

  it.each([400, 403, 404, 503])("refresh%s_isUnavailableAtOnce", async (status) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup();
    t.respond(httpError(status));
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.store.getSnapshot().status).toBe("unavailable");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(readHint(t.jar)).toBe("gen-1");
    expect(t.broadcast).not.toHaveBeenCalled();
  });

  it("refresh403_logsOneConfigurationError", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup();
    t.respond(httpError(403, { code: "FORBIDDEN" }));
    await t.store.getAccessToken();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toMatch(/configuration error/i);
  });

  it("rejectedRefresh_isUnavailableWithoutRetries", async () => {
    const t = setup();
    t.respond(new Error("NEXT_PUBLIC_API_URL is missing"));
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.store.getSnapshot().status).toBe("unavailable");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(readHint(t.jar)).toBe("gen-1");
    expect(t.broadcast).not.toHaveBeenCalled();
  });

  // Rule 8
  // "another sign-in" is covered by pageLoadRestore_hintChangesDuringTheRefresh_restoresTheNewSignInOnce: the dropped
  // result is still unused, and the page-load caller then restores the new sign-in once.
  it.each([
    ["a sign-out", (jar: FakeJar) => jar.put("sv_signed_in", null)],
    ["a pending logout", (jar: FakeJar) => jar.put("sv_logout_pending", "1")],
  ])("refreshResult_afterAnotherSignIn_isDropped (%s)", async (_case, change) => {
    const t = setup();
    const answer = deferred<RefreshResult>();
    t.respond(answer.promise);
    const before = t.store.getSnapshot();
    const token = t.store.getAccessToken();
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(1));
    change(t.jar);
    answer.resolve(ok(session()));
    await expect(token).resolves.toBeNull();
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(t.store.getSnapshot()).toBe(before);
    expect(t.jar.writes).toEqual([]);
    expect(t.store.generation()).toBeNull();
    expect(t.broadcast).not.toHaveBeenCalled();
  });

  it("refresh401_afterGenerationChange_clearsNothing", async () => {
    const t = setup();
    const answer = deferred<RefreshResult>();
    // The second answer is the page-load caller's one fresh restore of the new sign-in.
    t.respond(answer.promise, ok(session("u2", "at-2")));
    const ended = vi.fn();
    t.store.subscribe(() => {
      if (t.store.getSnapshot().status === "signed-out") ended();
    });
    const token = t.store.getAccessToken();
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(1));
    t.jar.put("sv_signed_in", "gen-2");
    answer.resolve(httpError(401, { code: "SESSION_EXPIRED" }));
    await expect(token).resolves.toBe("at-2");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
    expect(readHint(t.jar)).toBe("gen-2");
    // Nothing was cleared: the only write is the new sign-in's hint renewal.
    expect(t.jar.writes).toEqual(["sv_signed_in=gen-2; Path=/; SameSite=Lax; Max-Age=604800"]);
    expect(t.broadcast).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
  });

  it("networkRetries_stopWhenTheHintChanges", async () => {
    const t = setup();
    t.store.getSnapshot();
    t.refreshUnlocked.mockImplementationOnce(async () => {
      t.jar.put("sv_signed_in", "gen-2");
      return network;
    });
    // The retries of the first sign-in stop; the page-load caller restores the new sign-in once, without waiting.
    t.respond(ok(session("u2", "at-2")));
    await expect(t.store.getAccessToken()).resolves.toBe("at-2");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
    expect(t.sleeps).toEqual([]);
    expect(t.store.getSnapshot().status).toBe("signed-in");
    expect(t.store.generation()).toBe("gen-2");
  });

  // Final review M-1: a page-load restore dropped by a sign-in in another tab must not leave the page restoring.
  it("pageLoadRestore_hintChangesWhileWaitingForTheLock_restoresTheNewSignIn", async () => {
    const t = setup();
    const otherTabLogin = deferred<void>();
    const held = t.lock(() => otherTabLogin.promise);
    const token = t.store.getAccessToken();
    await Promise.resolve();
    // The other tab's login writes its hint while it holds the cookie lock.
    t.jar.put("sv_signed_in", "gen-2");
    t.respond(ok(session("u2", "at-2")));
    otherTabLogin.resolve();
    await held;
    await expect(token).resolves.toBe("at-2");
    expect(t.store.getSnapshot().status).toBe("signed-in");
    expect(t.store.generation()).toBe("gen-2");
    // The first restore found the hint changed before its refresh; only the new sign-in was refreshed.
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
  });

  it("pageLoadRestore_hintChangesDuringTheRefresh_restoresTheNewSignInOnce", async () => {
    const t = setup();
    const first = deferred<RefreshResult>();
    t.respond(first.promise, ok(session("u2", "at-2")));
    const token = t.store.getAccessToken();
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(1));
    t.jar.put("sv_signed_in", "gen-2");
    first.resolve(ok(session("u1", "at-old")));
    await expect(token).resolves.toBe("at-2");
    expect(t.store.getSnapshot().status).toBe("signed-in");
    expect(t.store.generation()).toBe("gen-2");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
    expect(t.jar.writes).toEqual(["sv_signed_in=gen-2; Path=/; SameSite=Lax; Max-Age=604800"]);
    expect(t.broadcast).not.toHaveBeenCalled();
  });

  it("pageLoadRestore_hintChangesTwice_restoresOnlyOnceMore", async () => {
    const t = setup();
    t.refreshUnlocked.mockImplementationOnce(async () => {
      t.jar.put("sv_signed_in", "gen-2");
      return ok(session("u1", "at-old"));
    });
    t.refreshUnlocked.mockImplementationOnce(async () => {
      t.jar.put("sv_signed_in", "gen-3");
      return ok(session("u2", "at-2"));
    });
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
  });

  it("retry_hintChangesWhileWaitingForTheLock_restoresTheNewSignIn", async () => {
    const t = setup();
    t.respond(httpError(500));
    await t.store.getAccessToken();
    expect(t.store.getSnapshot().status).toBe("unavailable");
    const otherTabLogin = deferred<void>();
    const held = t.lock(() => otherTabLogin.promise);
    const retried = t.store.retry();
    await Promise.resolve();
    t.jar.put("sv_signed_in", "gen-2");
    t.respond(ok(session("u2", "at-2")));
    otherTabLogin.resolve();
    await held;
    await retried;
    expect(t.store.getSnapshot().status).toBe("signed-in");
    expect(t.store.generation()).toBe("gen-2");
    await expect(t.store.getAccessToken()).resolves.toBe("at-2");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
  });

  it("tokenOfAnOlderSignIn_isNotReturned", async () => {
    const t = setup();
    t.respond(ok(session()));
    await t.store.getAccessToken();
    t.jar.put("sv_signed_in", "gen-2");
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
  });

  // Rule 9
  it("adopt_newSignIn_writesNewGenerationAndBroadcasts", async () => {
    const t = setup({ hint: null });
    t.store.adopt(session("u1", "at-login"), { newSignIn: true });
    const generation = t.store.generation();
    expect(generation).toMatch(/^[0-9a-f]{32}$/);
    expect(readHint(t.jar)).toBe(generation);
    expect(t.broadcast).toHaveBeenCalledWith({ type: "signed-in", generation });
    expect(t.store.getSnapshot().status).toBe("signed-in");
    expect(t.store.getSnapshot().user?.userId).toBe("u1");
    await expect(t.store.getAccessToken()).resolves.toBe("at-login");
    expect(t.refreshUnlocked).not.toHaveBeenCalled();
  });

  // Final review security m-3: what one person typed in a sign-up or reset on a shared PC does not outlive a session
  // change in this tab.
  describe("sign-up and reset progress", () => {
    function withProgress() {
      const storage = new Map<string, string>([
        ["sv_signup", "{}"],
        ["sv_reset", "{}"],
        ["other", "kept"],
      ]);
      const fake = {
        removeItem: vi.fn((key: string) => void storage.delete(key)),
      } as unknown as Storage;
      return { storage, fake };
    }

    function storeWith(sessionStorage: () => Storage | null) {
      return createSessionStore({
        api: { refreshUnlocked: vi.fn(), logoutUnlocked: vi.fn() },
        jar: new FakeJar(),
        now: () => 0,
        sleep: async () => undefined,
        lock: (task) => task(),
        broadcast: vi.fn(),
        onIdentityChange: vi.fn(),
        sessionStorage,
      });
    }

    it.each(["signed-out", "expired"] as const)("endLocally_clearsTheProgress (%s)", (reason) => {
      const { storage, fake } = withProgress();
      storeWith(() => fake).endLocally(reason);
      expect([...storage.keys()]).toEqual(["other"]);
    });

    it("adopt_newSignIn_clearsTheProgress", () => {
      const { storage, fake } = withProgress();
      storeWith(() => fake).adopt(session("u1", "at-login"), { newSignIn: true });
      expect([...storage.keys()]).toEqual(["other"]);
    });

    it("adopt_passwordChange_keepsTheProgress", () => {
      const { storage, fake } = withProgress();
      storeWith(() => fake).adopt(session("u1", "at-2"), { newSignIn: false });
      expect([...storage.keys()]).toEqual(["sv_signup", "sv_reset", "other"]);
    });

    it("blockedOrMissingStorage_neverThrows", () => {
      const blocked = storeWith(() => {
        throw new DOMException("blocked", "SecurityError");
      });
      expect(() => blocked.adopt(session("u1", "at-login"), { newSignIn: true })).not.toThrow();
      expect(() => blocked.endLocally("signed-out")).not.toThrow();
      const failing = storeWith(
        () =>
          ({
            removeItem: () => {
              throw new DOMException("blocked", "SecurityError");
            },
          }) as unknown as Storage,
      );
      expect(() => failing.endLocally("signed-out")).not.toThrow();
      expect(failing.getSnapshot()).toEqual({ status: "signed-out", user: null, endedBy: "signed-out" });
      expect(() => storeWith(() => null).endLocally("signed-out")).not.toThrow();
    });
  });

  it("adopt_passwordChange_keepsTheGeneration", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    const writes = t.jar.writes.length;
    t.store.adopt(session("u1", "at-2"), { newSignIn: false });
    expect(t.store.generation()).toBe("gen-1");
    expect(readHint(t.jar)).toBe("gen-1");
    expect(t.jar.writes).toHaveLength(writes);
    expect(t.broadcast).not.toHaveBeenCalled();
    await expect(t.store.getAccessToken()).resolves.toBe("at-2");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
  });

  // Rule 10 (auth-browser-session S-25)
  it("refresh_otherUserId_endsBothSessionsAndCallsOnIdentityChange", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")), ok(session("u2", "at-other")));
    await t.store.getAccessToken();
    t.setTime(900_000);
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.onIdentityChange).toHaveBeenCalledTimes(1);
    expect(t.logoutUnlocked).toHaveBeenCalledTimes(1);
    expect(t.store.getSnapshot()).toEqual({ status: "signed-out", user: null, endedBy: "signed-out" });
    expect(t.store.generation()).toBeNull();
    expect(readHint(t.jar)).toBeNull();
    expect(isLogoutPending(t.jar)).toBe(false);
    expect(t.broadcast).toHaveBeenCalledWith({ type: "signed-out", generation: null });
    // the other account's token is never handed out, and nothing refreshes any more
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
  });

  it("refresh_otherUserId_logsOutInsideTheSameLockHold", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")), ok(session("u2", "at-other")));
    await t.store.getAccessToken();
    t.events.length = 0;
    await expect(t.store.forceRefresh("at-1")).resolves.toBe("ended");
    expect(t.events).toEqual(["lock acquired", "refresh", "logout", "lock released"]);
    expect(t.logoutUnlocked).toHaveBeenCalledTimes(1);
  });

  it("refresh_otherUserId_setsTheFlagBeforeTheLogout", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")), ok(session("u2", "at-other")));
    await t.store.getAccessToken();
    let flagAtCall: boolean | undefined;
    t.logoutUnlocked.mockImplementationOnce(async () => {
      flagAtCall = isLogoutPending(t.jar);
      return { ok: true, data: undefined, status: 204, replayed: false };
    });
    await t.store.forceRefresh("at-1");
    expect(flagAtCall).toBe(true);
    expect(isLogoutPending(t.jar)).toBe(false);
  });

  it("refresh_otherUserId_queuedLogin_isNotFollowedByALogout", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    const answer = deferred<RefreshResult>();
    t.respond(answer.promise);
    const outcome = t.store.forceRefresh("at-1");
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(2));
    // A sign-in (this tab or another) queues on the cookie lock while the mismatched refresh holds it.
    const login = t.lock(async () => {
      t.events.push("login");
      return session("u3", "at-login");
    });
    answer.resolve(ok(session("u2", "at-other")));
    await expect(outcome).resolves.toBe("ended");
    const loggedIn = await login;
    t.store.adopt(loggedIn, { newSignIn: true });
    expect(isLogoutPending(t.jar)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.logoutUnlocked).toHaveBeenCalledTimes(1);
    expect(t.events.indexOf("logout")).toBeLessThan(t.events.indexOf("login"));
    expect(t.events.slice(t.events.indexOf("login"))).toEqual(["login", "lock released"]);
    // the new sign-in is visible and usable
    expect(readHint(t.jar)).toBe(t.store.generation());
    await expect(t.store.getAccessToken()).resolves.toBe("at-login");
  });

  // auth-browser-session S-23: the new sign-in replaced the refresh cookie, so a later retry would end the new session.
  it("refresh_otherUserId_failedLogout_queuedLoginAdopt_clearsTheFlag", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    const answer = deferred<RefreshResult>();
    t.respond(answer.promise);
    t.answerLogout({ ok: false, kind: "network" });
    const outcome = t.store.forceRefresh("at-1");
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(2));
    const login = t.lock(async () => session("u3", "at-login"));
    answer.resolve(ok(session("u2", "at-other")));
    await expect(outcome).resolves.toBe("ended");
    expect(isLogoutPending(t.jar)).toBe(true);

    t.store.adopt(await login, { newSignIn: true });

    expect(isLogoutPending(t.jar)).toBe(false);
    expect(readHint(t.jar)).toBe(t.store.generation());
    await expect(t.store.getAccessToken()).resolves.toBe("at-login");
    const logout = vi.fn();
    await retryPendingLogout({ api: { logout }, jar: t.jar });
    expect(logout).not.toHaveBeenCalled();
    expect(t.logoutUnlocked).toHaveBeenCalledTimes(1);
  });

  it("adopt_newSignIn_clearsAPendingLogout", async () => {
    const t = setup({ hint: null, pending: true });
    t.store.adopt(session("u1", "at-login"), { newSignIn: true });
    expect(isLogoutPending(t.jar)).toBe(false);
    await expect(t.store.getAccessToken()).resolves.toBe("at-login");
  });

  it("adopt_passwordChange_leavesAPendingLogout", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    t.jar.put("sv_logout_pending", "1");
    t.store.adopt(session("u1", "at-2"), { newSignIn: false });
    expect(isLogoutPending(t.jar)).toBe(true);
  });

  it("adopt_malformedNewSignIn_leavesAPendingLogout", () => {
    const t = setup({ hint: null, pending: true });
    t.store.adopt({ ...session(), accessToken: undefined }, { newSignIn: true });
    expect(isLogoutPending(t.jar)).toBe(true);
  });

  it.each([
    ["a network error", { ok: false, kind: "network" } as LogoutResult],
    ["a 500", { ok: false, kind: "http", status: 500, fieldErrors: [] } as LogoutResult],
    ["a rejection", new Error("config")],
  ])("refresh_otherUserId_failedLogout_keepsTheFlagAndSignsOut (%s)", async (_case, answer) => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")), ok(session("u2", "at-other")));
    await t.store.getAccessToken();
    t.answerLogout(answer);
    await expect(t.store.forceRefresh("at-1")).resolves.toBe("ended");
    expect(t.logoutUnlocked).toHaveBeenCalledTimes(1);
    expect(isLogoutPending(t.jar)).toBe(true);
    expect(t.store.getSnapshot()).toEqual({ status: "signed-out", user: null, endedBy: "signed-out" });
    expect(readHint(t.jar)).toBeNull();
    expect(t.onIdentityChange).toHaveBeenCalledTimes(1);
  });

  it("refresh_otherUserId_newerHintBeforeSettle_keepsTheNewSignIn", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")), ok(session("u2", "at-other")));
    await t.store.getAccessToken();
    // A newer sign-in (another tab) writes its hint after the mismatched refresh, before this tab settles.
    t.logoutUnlocked.mockImplementationOnce(async () => {
      t.jar.put("sv_signed_in", "gen-newer");
      return { ok: true, data: undefined, status: 204, replayed: false };
    });
    t.broadcast.mockClear();
    await expect(t.store.forceRefresh("at-1")).resolves.toBe("ended");
    expect(readHint(t.jar)).toBe("gen-newer");
    expect(t.onIdentityChange).not.toHaveBeenCalled();
    expect(t.broadcast).not.toHaveBeenCalled();
    // the other account's token is never handed out
    await expect(t.store.getAccessToken()).resolves.toBeNull();
  });

  it("refresh_otherUserId_flagClearThrows_stillEndsTheSession", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")), ok(session("u2", "at-other")));
    await t.store.getAccessToken();
    const cookie = Object.getOwnPropertyDescriptor(FakeJar.prototype, "cookie");
    Object.defineProperty(t.jar, "cookie", {
      get: () => cookie?.get?.call(t.jar) as string,
      set: (raw: string) => {
        if (raw.startsWith("sv_logout_pending=") && /max-age=0/i.test(raw)) throw new Error("blocked");
        cookie?.set?.call(t.jar, raw);
      },
    });
    await expect(t.store.forceRefresh("at-1")).resolves.toBe("ended");
    expect(t.store.getSnapshot()).toEqual({ status: "signed-out", user: null, endedBy: "signed-out" });
    expect(t.onIdentityChange).toHaveBeenCalledTimes(1);
    // the flag could not be cleared, so the next page load sends the logout again; this tab's hint is gone
    expect(isLogoutPending(t.jar)).toBe(true);
    expect(readHint(t.jar)).toBeNull();
  });

  // Rule 11
  it("forceRefresh_staleToken_doesNotRefreshTwice", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    const answer = deferred<RefreshResult>();
    t.respond(answer.promise);
    const first = t.store.forceRefresh("at-1");
    const second = t.store.forceRefresh("at-1");
    answer.resolve(ok(session("u1", "at-2")));
    await expect(Promise.all([first, second])).resolves.toEqual(["refreshed", "refreshed"]);
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
    await expect(t.store.forceRefresh("at-1")).resolves.toBe("refreshed");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
    await expect(t.store.getAccessToken()).resolves.toBe("at-2");
  });

  it("forceRefresh_outcomes_endedAndUnavailable", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")), httpError(401));
    await t.store.getAccessToken();
    await expect(t.store.forceRefresh("at-1")).resolves.toBe("ended");
    expect(t.store.getSnapshot().endedBy).toBe("expired");

    const u = setup();
    u.respond(ok(session("u1", "at-1")), httpError(502));
    await u.store.getAccessToken();
    await expect(u.store.forceRefresh("at-1")).resolves.toBe("unavailable");
    // no further automatic refresh while unavailable
    await expect(u.store.forceRefresh("at-1")).resolves.toBe("unavailable");
    expect(u.refreshUnlocked).toHaveBeenCalledTimes(2);
  });

  it("forceRefresh_newerTokenOfAnotherSignIn_isEnded", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    // A newer token in memory (a password change), then another tab signs in before this tab is reset.
    t.store.adopt(session("u1", "at-2"), { newSignIn: false });
    t.jar.put("sv_signed_in", "gen-2");
    await expect(t.store.forceRefresh("at-1")).resolves.toBe("ended");
    // A pending logout ends it too.
    const u = setup();
    u.respond(ok(session("u1", "at-1")));
    await u.store.getAccessToken();
    u.store.adopt(session("u1", "at-2"), { newSignIn: false });
    u.jar.put("sv_logout_pending", "1");
    await expect(u.store.forceRefresh("at-1")).resolves.toBe("ended");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(u.refreshUnlocked).toHaveBeenCalledTimes(1);
  });

  it("forceRefresh_droppedResult_isEnded", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    const answer = deferred<RefreshResult>();
    t.respond(answer.promise);
    const outcome = t.store.forceRefresh("at-1");
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(2));
    t.jar.put("sv_signed_in", null);
    answer.resolve(ok(session("u1", "at-2")));
    await expect(outcome).resolves.toBe("ended");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
  });

  // Snapshot (useSyncExternalStore)
  it("getSnapshot_isStableUntilSomethingChanges", async () => {
    const t = setup();
    const listener = vi.fn();
    const unsubscribe = t.store.subscribe(listener);
    const first = t.store.getSnapshot();
    expect(first).toEqual({ status: "restoring", user: null });
    expect(t.store.getSnapshot()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(t.refreshUnlocked).not.toHaveBeenCalled();

    t.respond(ok(session()));
    await t.store.getAccessToken();
    const second = t.store.getSnapshot();
    expect(second).not.toBe(first);
    expect(second.status).toBe("signed-in");
    expect(t.store.getSnapshot()).toBe(second);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    t.store.markUnavailable();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("createSessionStore_doesNotReadCookiesAtConstruction", () => {
    const t = setup();
    expect(t.jar.reads).toBe(0);
  });

  // markUnavailable / retry (S-17)
  it("markUnavailable_dropsTheTokenAndStopsAutomaticRefresh", async () => {
    const t = setup();
    t.respond(ok(session()));
    await t.store.getAccessToken();
    t.store.markUnavailable(15);
    expect(t.store.getSnapshot()).toEqual({
      status: "unavailable",
      user: expect.objectContaining({ userId: "u1" }),
      retryAfterSeconds: 15,
    });
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(readHint(t.jar)).toBe("gen-1");
  });

  it("retry_runsOneNewRestore", async () => {
    const t = setup();
    t.respond(httpError(500), ok(session("u1", "at-2")));
    await t.store.getAccessToken();
    const seen: string[] = [];
    t.store.subscribe(() => seen.push(t.store.getSnapshot().status));
    await t.store.retry();
    expect(seen).toEqual(["restoring", "signed-in"]);
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
    await expect(t.store.getAccessToken()).resolves.toBe("at-2");
  });

  it("retry_withoutHint_isSignedOutWithoutRefresh", async () => {
    const t = setup();
    t.respond(httpError(500));
    await t.store.getAccessToken();
    t.jar.put("sv_signed_in", null);
    await t.store.retry();
    expect(t.store.getSnapshot()).toEqual({ status: "signed-out", user: null });
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
  });

  // endLocally / updateUser
  it("endLocally_clearsEverythingAndBroadcasts", async () => {
    const t = setup();
    t.respond(ok(session()));
    await t.store.getAccessToken();
    t.store.endLocally("signed-out");
    expect(t.store.getSnapshot()).toEqual({ status: "signed-out", user: null, endedBy: "signed-out" });
    expect(readHint(t.jar)).toBeNull();
    expect(t.broadcast).toHaveBeenCalledWith({ type: "signed-out", generation: null });
    expect(t.store.generation()).toBeNull();
    await expect(t.store.getAccessToken()).resolves.toBeNull();
  });

  it("updateUser_patchesTheSummaryButKeepsTheUserId", async () => {
    const t = setup();
    t.respond(ok(session()));
    await t.store.getAccessToken();
    t.store.updateUser({ phoneVerified: false, fullName: "B", userId: "other" });
    expect(t.store.getSnapshot().user).toEqual(
      expect.objectContaining({ userId: "u1", fullName: "B", phoneVerified: false }),
    );
  });

  // Fix round 1
  it("generationChange_dropsLocalStateAndKeepsTheNewHint", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    t.jar.put("sv_signed_in", "gen-2");
    const writes = [...t.jar.writes];
    t.store.resetLocal();
    expect(t.store.getSnapshot()).toEqual({ status: "restoring", user: null });
    expect(t.store.generation()).toBeNull();
    expect(readHint(t.jar)).toBe("gen-2");
    expect(t.jar.writes).toEqual(writes);
    expect(t.broadcast).not.toHaveBeenCalled();

    t.respond(ok(session("u2", "at-2")));
    await expect(t.store.getAccessToken()).resolves.toBe("at-2");
    expect(t.onIdentityChange).not.toHaveBeenCalled();
    expect(t.logoutUnlocked).not.toHaveBeenCalled();
    expect(t.store.generation()).toBe("gen-2");
    expect(t.store.getSnapshot().user?.userId).toBe("u2");
  });

  it("resetLocal_withoutHint_isSignedOutWithoutEndedBy", async () => {
    const t = setup();
    t.respond(ok(session()));
    await t.store.getAccessToken();
    t.jar.put("sv_logout_pending", "1");
    t.store.resetLocal();
    expect(t.store.getSnapshot()).toEqual({ status: "signed-out", user: null });
    expect(t.broadcast).not.toHaveBeenCalled();
  });

  it("resetLocal_forgetsTheInFlightRestore", async () => {
    const t = setup();
    const oldAnswer = deferred<RefreshResult>();
    const newAnswer = deferred<RefreshResult>();
    t.respond(oldAnswer.promise, newAnswer.promise);
    const oldCall = t.store.getAccessToken();
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(1));
    t.jar.put("sv_signed_in", "gen-2");
    t.store.resetLocal();
    const newCall = t.store.getAccessToken();
    // the new restore waits for the lock the old one still holds
    oldAnswer.resolve(ok(session("u1", "at-old")));
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(2));
    // the old restore has settled; that must not forget the new one
    await new Promise((resolve) => setTimeout(resolve, 0));
    const joined = t.store.getAccessToken();
    newAnswer.resolve(ok(session("u2", "at-new")));
    // the old caller's result was dropped; it is answered from the one fresh restore of the new generation
    await expect(Promise.all([oldCall, newCall, joined])).resolves.toEqual(["at-new", "at-new", "at-new"]);
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
    expect(t.store.generation()).toBe("gen-2");
  });

  it("adopt_duringARestore_isNotOverwrittenByIt", async () => {
    const t = setup();
    const answer = deferred<RefreshResult>();
    t.respond(answer.promise);
    const restoring = t.store.getAccessToken();
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(1));
    t.store.adopt(session("u1", "at-login"), { newSignIn: true });
    answer.resolve(ok(session("u1", "at-old")));
    await expect(restoring).resolves.toBe("at-login");
    await expect(t.store.getAccessToken()).resolves.toBe("at-login");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
  });

  // Fix round 2
  it("forceRefresh_waitingDuringPasswordChangeAdopt_isRefreshed", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    const passwordChange = deferred<void>();
    const held = t.lock(() => passwordChange.promise);
    const outcome = t.store.forceRefresh("at-1");
    await Promise.resolve();
    t.store.adopt(session("u1", "at-2"), { newSignIn: false });
    passwordChange.resolve();
    await held;
    await expect(outcome).resolves.toBe("refreshed");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(t.store.getSnapshot().status).toBe("signed-in");
    await expect(t.store.getAccessToken()).resolves.toBe("at-2");
  });

  it("getAccessToken_waitingDuringPasswordChangeAdopt_getsTheAdoptedToken", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    t.setTime(900_000);
    const passwordChange = deferred<void>();
    const held = t.lock(() => passwordChange.promise);
    const token = t.store.getAccessToken();
    await Promise.resolve();
    t.store.adopt(session("u1", "at-2"), { newSignIn: false });
    passwordChange.resolve();
    await held;
    await expect(token).resolves.toBe("at-2");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
  });

  it("forceRefresh_waitingWhenMarkedUnavailable_isUnavailable", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    const answer = deferred<RefreshResult>();
    t.respond(answer.promise);
    const outcome = t.store.forceRefresh("at-1");
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(2));
    t.store.markUnavailable();
    answer.resolve(ok(session("u1", "at-2")));
    await expect(outcome).resolves.toBe("unavailable");
  });

  it("markUnavailable_dropsTheInFlightRestore", async () => {
    const t = setup();
    const answer = deferred<RefreshResult>();
    t.respond(answer.promise);
    const token = t.store.getAccessToken();
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(1));
    t.store.markUnavailable();
    answer.resolve(ok(session()));
    await expect(token).resolves.toBeNull();
    expect(t.store.getSnapshot()).toEqual({ status: "unavailable", user: null });
    expect(t.jar.writes).toEqual([]);
    await expect(t.store.getAccessToken()).resolves.toBeNull();
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
  });

  it("rejectedLock_isUnavailable", async () => {
    const jar = new FakeJar();
    jar.put("sv_signed_in", "gen-1");
    const refreshUnlocked = vi.fn(async (): Promise<RefreshResult> => ok(session()));
    const broadcast = vi.fn();
    const store = createSessionStore({
      api: { refreshUnlocked, logoutUnlocked: vi.fn() },
      jar,
      now: () => 0,
      sleep: async () => {},
      lock: async () => {
        throw new DOMException("blocked", "SecurityError");
      },
      broadcast,
      onIdentityChange: vi.fn(),
    });
    await expect(store.getAccessToken()).resolves.toBeNull();
    expect(store.getSnapshot().status).toBe("unavailable");
    expect(refreshUnlocked).not.toHaveBeenCalled();
    expect(readHint(jar)).toBe("gen-1");
    expect(broadcast).not.toHaveBeenCalled();
  });

  it.each([
    ["no access token", { ...session(), accessToken: undefined }],
    ["no expiresIn", { ...session(), expiresIn: undefined }],
    ["no user id", { ...session(), user: { ...session().user, userId: undefined } }],
  ])("adopt_malformedResponse_hasNoSideEffects (%s)", async (_case, response) => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    const writes = [...t.jar.writes];
    t.store.adopt(response, { newSignIn: true });
    expect(t.jar.writes).toEqual(writes);
    expect(t.broadcast).not.toHaveBeenCalled();
    expect(t.store.generation()).toBe("gen-1");
    expect(t.store.getSnapshot()).toEqual({ status: "unavailable", user: null });
    await expect(t.store.getAccessToken()).resolves.toBeNull();
  });

  it("throwingListener_doesNotSkipOtherListenersOrTheBroadcast", async () => {
    const t = setup();
    t.respond(ok(session()));
    await t.store.getAccessToken();
    const other = vi.fn();
    t.store.subscribe(() => {
      throw new Error("listener failed");
    });
    t.store.subscribe(other);
    expect(() => t.store.endLocally("signed-out")).not.toThrow();
    expect(other).toHaveBeenCalledTimes(1);
    expect(t.broadcast).toHaveBeenCalledWith({ type: "signed-out", generation: null });
  });

  // Fix round 3: a caller bound to one sign-in is never answered with another sign-in's token
  it("forceRefresh_waitingAcrossResetLocal_isEnded", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    const answer = deferred<RefreshResult>();
    t.respond(answer.promise, ok(session("u2", "at-u2")));
    const outcome = t.store.forceRefresh("at-1");
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(2));
    t.jar.put("sv_signed_in", "gen-2");
    t.store.resetLocal();
    answer.resolve(ok(session("u1", "at-1b")));
    await expect(outcome).resolves.toBe("ended");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
  });

  it("forceRefresh_waitingAcrossNewSignInAdopt_isEnded", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    const login = deferred<void>();
    const held = t.lock(() => login.promise);
    const outcome = t.store.forceRefresh("at-1");
    await Promise.resolve();
    t.store.adopt(session("u2", "at-u2"), { newSignIn: true });
    login.resolve();
    await held;
    await expect(outcome).resolves.toBe("ended");
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(1);
    // the new sign-in itself is intact
    await expect(t.store.getAccessToken()).resolves.toBe("at-u2");
  });

  it("getAccessToken_boundCallerAcrossResetLocal_isNull", async () => {
    const t = setup();
    t.respond(ok(session("u1", "at-1")));
    await t.store.getAccessToken();
    t.setTime(900_000);
    const answer = deferred<RefreshResult>();
    t.respond(answer.promise, ok(session("u2", "at-u2")));
    const token = t.store.getAccessToken();
    await vi.waitFor(() => expect(t.refreshUnlocked).toHaveBeenCalledTimes(2));
    t.jar.put("sv_signed_in", "gen-2");
    t.store.resetLocal();
    answer.resolve(ok(session("u1", "at-1b")));
    await expect(token).resolves.toBeNull();
    expect(t.refreshUnlocked).toHaveBeenCalledTimes(2);
  });
});
