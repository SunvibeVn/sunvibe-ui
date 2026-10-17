import { afterEach, describe, expect, it, vi } from "vitest";

import { isLogoutPending } from "./browser-cookies";
import { retryPendingLogout, settlePendingLogoutBeforeSignIn, signOut } from "./logout";
import type { SessionApi } from "./session-api";

type LogoutResult = Awaited<ReturnType<SessionApi["logout"]>>;

/** Minimal `document.cookie` model that records every write into a shared event log. */
class FakeJar {
  private readonly store = new Map<string, string>();

  constructor(private readonly events: string[] = []) {}

  get cookie(): string {
    return [...this.store].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  set cookie(raw: string) {
    const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    const expired = attributes.some((attribute) => attribute.toLowerCase() === "max-age=0");
    this.events.push(`${expired ? "clear" : "set"} ${name}`);
    if (expired) this.store.delete(name);
    else this.store.set(name, value);
  }

  put(name: string, value: string): void {
    this.store.set(name, value);
  }
}

const success: LogoutResult = { ok: true, data: undefined, status: 204, replayed: false };
const httpError = (status: number): LogoutResult => ({ ok: false, kind: "http", status, fieldErrors: [] });
const network: LogoutResult = { ok: false, kind: "network" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup({ pending = false, answer = success }: { pending?: boolean; answer?: LogoutResult } = {}) {
  const events: string[] = [];
  const jar = new FakeJar(events);
  if (pending) jar.put("sv_logout_pending", "1");
  const flagAtCall: boolean[] = [];
  const logout = vi.fn(async (): Promise<LogoutResult> => {
    events.push("logout");
    flagAtCall.push(isLogoutPending(jar));
    return answer;
  });
  // Spies that must never be called: nothing in the logout flow refreshes or reads a token.
  const refresh = vi.fn();
  const refreshUnlocked = vi.fn();
  const getAccessToken = vi.fn();
  const endLocally = vi.fn((reason: "expired" | "signed-out") => {
    events.push(`endLocally ${reason}`);
  });
  const api = { logout, refresh, refreshUnlocked };
  const store = { endLocally, getAccessToken };
  return { events, jar, flagAtCall, logout, refresh, refreshUnlocked, getAccessToken, endLocally, api, store };
}

/** A jar whose cookie getter throws, like `document.cookie` in a sandboxed frame. */
const throwingJar = {
  get cookie(): string {
    throw new DOMException("blocked", "SecurityError");
  },
  set cookie(_value: string) {
    throw new DOMException("blocked", "SecurityError");
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("signOut", () => {
  it("signOut_setsTheFlagBeforeTheCall", async () => {
    const t = setup();
    await signOut({ api: t.api, store: t.store, jar: t.jar });
    expect(t.flagAtCall).toEqual([true]);
  });

  it("signOut_order_flagThenLocalEndThenCall", async () => {
    const t = setup();
    await signOut({ api: t.api, store: t.store, jar: t.jar });
    expect(t.events).toEqual([
      "set sv_logout_pending",
      "endLocally signed-out",
      "logout",
      "clear sv_logout_pending",
    ]);
  });

  it("signOut_2xx_clearsTheFlag", async () => {
    const t = setup();
    await expect(signOut({ api: t.api, store: t.store, jar: t.jar })).resolves.toBe("done");
    expect(isLogoutPending(t.jar)).toBe(false);
    expect(t.endLocally).toHaveBeenCalledWith("signed-out");
  });

  it("signOut_networkError_keepsTheFlag", async () => {
    const t = setup({ answer: network });
    await expect(signOut({ api: t.api, store: t.store, jar: t.jar })).resolves.toBe("server-failed");
    expect(isLogoutPending(t.jar)).toBe(true);
    expect(t.endLocally).toHaveBeenCalledWith("signed-out");
  });

  it("signOut_403_keepsTheFlag", async () => {
    const t = setup({ answer: httpError(403) });
    await expect(signOut({ api: t.api, store: t.store, jar: t.jar })).resolves.toBe("server-failed");
    expect(isLogoutPending(t.jar)).toBe(true);
  });

  it.each([429, 500, 503])("signOut_%i_keepsTheFlag", async (status) => {
    const t = setup({ answer: httpError(status) });
    await expect(signOut({ api: t.api, store: t.store, jar: t.jar })).resolves.toBe("server-failed");
    expect(isLogoutPending(t.jar)).toBe(true);
  });

  it("signOut_rejection_serverFailedAndKeepsTheFlag", async () => {
    const t = setup();
    t.logout.mockRejectedValueOnce(new Error("NEXT_PUBLIC_API_URL is missing"));
    await expect(signOut({ api: t.api, store: t.store, jar: t.jar })).resolves.toBe("server-failed");
    expect(isLogoutPending(t.jar)).toBe(true);
    expect(t.endLocally).toHaveBeenCalledWith("signed-out");
  });

  it("signOut_neverRefreshes", async () => {
    const t = setup({ answer: network });
    await signOut({ api: t.api, store: t.store, jar: t.jar });
    expect(t.refresh).not.toHaveBeenCalled();
    expect(t.refreshUnlocked).not.toHaveBeenCalled();
    expect(t.getAccessToken).not.toHaveBeenCalled();
  });

  it("signOut_doubleClick_sharesOneLogoutRequest", async () => {
    const t = setup();
    const answer = deferred<LogoutResult>();
    t.logout.mockImplementationOnce(() => answer.promise);
    const first = signOut({ api: t.api, store: t.store, jar: t.jar });
    const second = signOut({ api: t.api, store: t.store, jar: t.jar });
    answer.resolve(success);
    await expect(Promise.all([first, second])).resolves.toEqual(["done", "done"]);
    expect(t.logout).toHaveBeenCalledTimes(1);
    expect(isLogoutPending(t.jar)).toBe(false);
  });

  it("signOut_afterAFinishedRequest_sendsANewOne", async () => {
    const t = setup({ answer: network });
    await signOut({ api: t.api, store: t.store, jar: t.jar });
    await signOut({ api: t.api, store: t.store, jar: t.jar });
    expect(t.logout).toHaveBeenCalledTimes(2);
  });
});

describe("retryPendingLogout", () => {
  it("retryPendingLogout_noFlag_sendsNothing", async () => {
    const t = setup();
    await retryPendingLogout({ api: t.api, jar: t.jar });
    expect(t.logout).not.toHaveBeenCalled();
  });

  it("retryPendingLogout_2xx_clearsTheFlag", async () => {
    const t = setup({ pending: true });
    await retryPendingLogout({ api: t.api, jar: t.jar });
    expect(t.logout).toHaveBeenCalledTimes(1);
    expect(isLogoutPending(t.jar)).toBe(false);
  });

  it("retryPendingLogout_failure_keepsTheFlag", async () => {
    const t = setup({ pending: true, answer: httpError(500) });
    await expect(retryPendingLogout({ api: t.api, jar: t.jar })).resolves.toBeUndefined();
    expect(isLogoutPending(t.jar)).toBe(true);
  });

  it("retryPendingLogout_rejection_keepsTheFlagWithoutThrowing", async () => {
    const t = setup({ pending: true });
    t.logout.mockRejectedValueOnce(new Error("config"));
    await expect(retryPendingLogout({ api: t.api, jar: t.jar })).resolves.toBeUndefined();
    expect(isLogoutPending(t.jar)).toBe(true);
  });

  it("retryPendingLogout_neverRefreshes", async () => {
    const t = setup({ pending: true, answer: network });
    await retryPendingLogout({ api: t.api, jar: t.jar });
    expect(t.refresh).not.toHaveBeenCalled();
    expect(t.refreshUnlocked).not.toHaveBeenCalled();
    expect(t.getAccessToken).not.toHaveBeenCalled();
  });

  it("retryPendingLogout_throwingCookies_resolvesWithoutARequest", async () => {
    const t = setup();
    await expect(retryPendingLogout({ api: t.api, jar: throwingJar })).resolves.toBeUndefined();
    expect(t.logout).not.toHaveBeenCalled();
  });

  it("retryPendingLogout_mountedTwice_sendsOneRequest", async () => {
    const t = setup({ pending: true });
    const answer = deferred<LogoutResult>();
    t.logout.mockImplementationOnce(() => answer.promise);
    const first = retryPendingLogout({ api: t.api, jar: t.jar });
    const second = retryPendingLogout({ api: t.api, jar: t.jar });
    answer.resolve(success);
    await Promise.all([first, second]);
    expect(t.logout).toHaveBeenCalledTimes(1);
    expect(isLogoutPending(t.jar)).toBe(false);
  });

  it("retryPendingLogout_duringSignOut_sharesItsRequest", async () => {
    const t = setup();
    const answer = deferred<LogoutResult>();
    t.logout.mockImplementationOnce(() => answer.promise);
    const out = signOut({ api: t.api, store: t.store, jar: t.jar });
    const retried = retryPendingLogout({ api: t.api, jar: t.jar });
    answer.resolve(success);
    await Promise.all([out, retried]);
    expect(t.logout).toHaveBeenCalledTimes(1);
  });
});

describe("settlePendingLogoutBeforeSignIn", () => {
  it("settleBeforeSignIn_noFlag_sendsNothing", async () => {
    const t = setup();
    await settlePendingLogoutBeforeSignIn({ api: t.api, jar: t.jar });
    expect(t.logout).not.toHaveBeenCalled();
  });

  it("settleBeforeSignIn_throwingCookies_resolvesWithoutARequest", async () => {
    const t = setup();
    await expect(settlePendingLogoutBeforeSignIn({ api: t.api, jar: throwingJar })).resolves.toBeUndefined();
    expect(t.logout).not.toHaveBeenCalled();
  });

  it("signOut_throwingCookies_stillEndsLocallyAndCallsTheApi", async () => {
    const t = setup();
    await expect(signOut({ api: t.api, store: t.store, jar: throwingJar })).resolves.toBe("done");
    expect(t.endLocally).toHaveBeenCalledWith("signed-out");
    expect(t.logout).toHaveBeenCalledTimes(1);
  });

  it("settleBeforeSignIn_2xx_clearsTheFlag", async () => {
    const t = setup({ pending: true });
    await settlePendingLogoutBeforeSignIn({ api: t.api, jar: t.jar });
    expect(t.logout).toHaveBeenCalledTimes(1);
    expect(isLogoutPending(t.jar)).toBe(false);
  });

  it("settleBeforeSignIn_failure_stillClearsTheFlag", async () => {
    const t = setup({ pending: true, answer: network });
    await settlePendingLogoutBeforeSignIn({ api: t.api, jar: t.jar });
    expect(t.logout).toHaveBeenCalledTimes(1);
    expect(isLogoutPending(t.jar)).toBe(false);
  });

  it("settleBeforeSignIn_rejection_stillClearsTheFlag", async () => {
    const t = setup({ pending: true });
    t.logout.mockRejectedValueOnce(new Error("config"));
    await expect(settlePendingLogoutBeforeSignIn({ api: t.api, jar: t.jar })).resolves.toBeUndefined();
    expect(isLogoutPending(t.jar)).toBe(false);
  });

  it("settleBeforeSignIn_clearsTheFlagOnlyAfterTheAttempt", async () => {
    const t = setup({ pending: true, answer: httpError(503) });
    await settlePendingLogoutBeforeSignIn({ api: t.api, jar: t.jar });
    expect(t.flagAtCall).toEqual([true]);
    expect(t.events).toEqual(["logout", "clear sv_logout_pending"]);
  });
});
