import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import type { SessionApi, SessionResponse } from "./session-api";
import { createSessionStore, type SessionStore } from "./session-store";

type RefreshResult = Awaited<ReturnType<SessionApi["refreshUnlocked"]>>;

/** Minimal `document.cookie` model: the setter takes one cookie string, the getter returns `name=value` pairs. */
class FakeJar {
  private readonly store = new Map<string, string>();

  get cookie(): string {
    return [...this.store].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  set cookie(raw: string) {
    const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const expired = attributes.some((attribute) => attribute.toLowerCase() === "max-age=0");
    if (expired) this.store.delete(name);
    else this.store.set(name, pair.slice(separator + 1));
  }
}

function session(accessToken: string, userId = "u1"): SessionResponse {
  return {
    accessToken,
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

const ok = (data: SessionResponse): RefreshResult => ({ ok: true, data, status: 200, replayed: false });
const refreshError = (status: number): RefreshResult => ({ ok: false, kind: "http", status, fieldErrors: [] });

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const me = { userId: "u1", fullName: "Nguyen Van A" };
const chain401 = () => json(401, { error: "Unauthorized", message: "x", path: "/api/v1/me" });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type SetupOptions = { signedIn?: boolean; hint?: boolean };

function setup(
  respond: (request: Request) => Promise<Response> | Response = () => json(200, me),
  { signedIn = true, hint = true }: SetupOptions = {},
) {
  const jar = new FakeJar();
  if (hint) jar.cookie = "sv_signed_in=gen-1; Path=/";
  const refreshes: Array<RefreshResult | Promise<RefreshResult>> = [];
  const refreshUnlocked = vi.fn(async (): Promise<RefreshResult> => {
    const next = refreshes.shift();
    if (next === undefined) throw new Error("unexpected refresh");
    return next;
  });
  let time = 0;
  const store: SessionStore = createSessionStore({
    api: { refreshUnlocked, logoutUnlocked: vi.fn() },
    jar,
    now: () => time,
    sleep: async () => undefined,
    lock: (task) => task(),
    broadcast: vi.fn(),
    onIdentityChange: vi.fn(),
  });
  // A session already held in memory: the first call needs no refresh.
  if (signedIn) store.adopt(session("at-1"), { newSignIn: false });

  const requests: Request[] = [];
  const api = createApiClient({
    store,
    baseUrl: "http://api.test",
    fetch: async (request) => {
      requests.push(request);
      return respond(request);
    },
  });
  return {
    store,
    jar,
    api,
    requests,
    refreshUnlocked,
    refreshWith: (...results: Array<RefreshResult | Promise<RefreshResult>>) => refreshes.push(...results),
    advance: (ms: number) => {
      time += ms;
    },
  };
}

const getMe = (api: ReturnType<typeof createApiClient>) => api.callApi((client) => client.GET("/api/v1/me"));
const bearerOf = (request: Request) => request.headers.get("Authorization");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock("@/config/public-env");
  vi.resetModules();
});

/** Another tab signs in as someone else: the sync resets this tab (auth-browser-session §4.5). */
function signInElsewhere(jar: FakeJar, store: SessionStore): void {
  jar.cookie = "sv_signed_in=gen-2; Path=/";
  store.resetLocal();
}

describe("api client and the 401 rule (W10-24, W10-31, W10-32, W10-34)", () => {
  it("call_addsBearerAndOmitsCredentials", async () => {
    const { api, requests, refreshUnlocked } = setup();
    const result = await getMe(api);
    expect(result).toMatchObject({ ok: true, status: 200, data: me });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("http://api.test/api/v1/me");
    expect(bearerOf(requests[0])).toBe("Bearer at-1");
    expect(requests[0].credentials).toBe("omit");
    expect(refreshUnlocked).not.toHaveBeenCalled();
  });

  it("call_toAnotherOrigin_sendsNoRequestAndIsANetworkError", async () => {
    const { api, requests } = setup();
    for (const baseUrl of ["https://evil.test", "http://api.test.evil.test", "https://api.test", "http://api.test:8080"]) {
      const result = await api.callApi((client) => client.GET("/api/v1/me", { baseUrl }));
      expect(result).toEqual({ ok: false, kind: "network" });
    }
    // The Bearer never left for another origin: no request reached the network at all.
    expect(requests).toHaveLength(0);
    // The API's own origin still works through a per-request base URL.
    const same = await api.callApi((client) => client.GET("/api/v1/me", { baseUrl: "http://api.test/" }));
    expect(same).toMatchObject({ ok: true, status: 200 });
    expect(requests).toHaveLength(1);
  });

  it("call_cannotOverrideCredentialsOrTheBearer", async () => {
    const { api, requests } = setup();
    await api.callApi((client) =>
      client.GET("/api/v1/me", { credentials: "include", headers: { Authorization: "Bearer other" } }),
    );
    expect(requests[0].credentials).toBe("omit");
    expect(bearerOf(requests[0])).toBe("Bearer at-1");
  });

  it("call_401_refreshesOnceAndRetriesOnce", async () => {
    const { api, requests, refreshUnlocked, refreshWith, store } = setup((request) =>
      bearerOf(request) === "Bearer at-1" ? chain401() : json(200, me),
    );
    refreshWith(ok(session("at-2")));
    const result = await getMe(api);
    expect(result).toMatchObject({ ok: true, status: 200, data: me });
    expect(requests.map(bearerOf)).toEqual(["Bearer at-1", "Bearer at-2"]);
    expect(requests.every((request) => request.credentials === "omit")).toBe(true);
    expect(refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().status).toBe("signed-in");
  });

  it("call_401_retriedPostKeepsItsBody", async () => {
    const bodies: string[] = [];
    const { api, requests, refreshWith } = setup(async (request) => {
      bodies.push(await request.text());
      return bearerOf(request) === "Bearer at-1" ? chain401() : json(200, { phoneVerified: true });
    });
    refreshWith(ok(session("at-2")));
    const result = await api.callApi((client) =>
      client.POST("/api/v1/me/verification/phone/confirm-code", { body: { code: "123456" } }),
    );
    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(requests.map((request) => request.method)).toEqual(["POST", "POST"]);
    expect(bodies).toEqual(['{"code":"123456"}', '{"code":"123456"}']);
  });

  it("call_two401sAtOnce_shareOneRefresh", async () => {
    const { api, requests, refreshUnlocked, refreshWith, store } = setup((request) =>
      bearerOf(request) === "Bearer at-1" ? chain401() : json(200, me),
    );
    const forceRefresh = vi.spyOn(store, "forceRefresh");
    const refresh = deferred<RefreshResult>();
    refreshWith(refresh.promise);
    const first = getMe(api);
    const second = getMe(api);
    // Both 401s arrive while the one refresh is still in flight.
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    await vi.waitFor(() => expect(forceRefresh).toHaveBeenCalledTimes(2));
    expect(refreshUnlocked).toHaveBeenCalledTimes(1);
    refresh.resolve(ok(session("at-2")));
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.ok)).toEqual([true, true]);
    expect(refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(requests.map(bearerOf).sort()).toEqual(["Bearer at-1", "Bearer at-1", "Bearer at-2", "Bearer at-2"]);
  });

  it("call_retryAgain401_marksUnavailableWithoutAnotherRefresh", async () => {
    const { api, requests, refreshUnlocked, refreshWith, store } = setup(() => chain401());
    refreshWith(ok(session("at-2")));
    const result = await getMe(api);
    expect(result).toEqual({ ok: false, kind: "unavailable" });
    expect(requests.map(bearerOf)).toEqual(["Bearer at-1", "Bearer at-2"]);
    expect(refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().status).toBe("unavailable");
    // The store stays unavailable: the next call neither refreshes nor reaches the API.
    expect(await getMe(api)).toEqual({ ok: false, kind: "unavailable" });
    expect(requests).toHaveLength(2);
    expect(refreshUnlocked).toHaveBeenCalledTimes(1);
  });

  it("call_refresh401_returnsSignedOut", async () => {
    const { api, requests, refreshUnlocked, refreshWith, store } = setup(() => chain401());
    refreshWith(refreshError(401));
    const result = await getMe(api);
    expect(result).toEqual({ ok: false, kind: "signed-out" });
    expect(requests).toHaveLength(1);
    expect(refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ status: "signed-out", endedBy: "expired" });
  });

  it("call_refreshUnavailable_returnsUnavailableAndKeepsTheSession", async () => {
    const { api, requests, refreshWith, store } = setup(() => chain401());
    refreshWith({ ok: false, kind: "http", status: 429, fieldErrors: [], retryAfterSeconds: 20 });
    const result = await getMe(api);
    expect(result).toEqual({ ok: false, kind: "unavailable", retryAfterSeconds: 20 });
    expect(requests).toHaveLength(1);
    expect(store.getSnapshot()).toMatchObject({ status: "unavailable", user: { userId: "u1" } });
  });

  it("call_403_passesThroughAndKeepsTheSession", async () => {
    const { api, refreshUnlocked, store } = setup(() =>
      json(403, { error: "Forbidden", message: "x", path: "/api/v1/staff/owner-leads" }),
    );
    const result = await api.callApi((client) => client.GET("/api/v1/staff/owner-leads"));
    expect(result).toMatchObject({ ok: false, kind: "http", status: 403 });
    expect(refreshUnlocked).not.toHaveBeenCalled();
    expect(store.getSnapshot().status).toBe("signed-in");
  });

  it("call_otherErrorStatus_passesThrough", async () => {
    const { api, refreshUnlocked, store } = setup(() =>
      json(400, { code: "ALREADY_VERIFIED", message: "x", errors: [] }),
    );
    const result = await api.callApi((client) => client.POST("/api/v1/me/verification/phone/send-code"));
    expect(result).toMatchObject({ ok: false, kind: "http", status: 400, code: "ALREADY_VERIFIED" });
    expect(refreshUnlocked).not.toHaveBeenCalled();
    expect(store.getSnapshot().status).toBe("signed-in");
  });

  it("call_networkError_returnsNetworkAndKeepsTheSession", async () => {
    const { api, refreshUnlocked, store } = setup(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await getMe(api)).toEqual({ ok: false, kind: "network" });
    expect(refreshUnlocked).not.toHaveBeenCalled();
    expect(store.getSnapshot().status).toBe("signed-in");
  });

  it("call_timesOutAfter15Seconds", async () => {
    vi.useFakeTimers();
    const { api, store } = setup(
      (request) =>
        new Promise<Response>((_, reject) => {
          request.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const pending = getMe(api);
    await vi.advanceTimersByTimeAsync(14_999);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, kind: "network" });
    expect(store.getSnapshot().status).toBe("signed-in");
  });

  it("call_noHint_returnsSignedOutWithoutRequest", async () => {
    const { api, requests, refreshUnlocked } = setup(undefined, { signedIn: false, hint: false });
    expect(await getMe(api)).toEqual({ ok: false, kind: "signed-out" });
    expect(requests).toHaveLength(0);
    expect(refreshUnlocked).not.toHaveBeenCalled();
  });

  it("call_whileUnavailable_returnsUnavailableWithoutRequest", async () => {
    const { api, requests, refreshUnlocked, store } = setup();
    store.markUnavailable(30);
    expect(await getMe(api)).toEqual({ ok: false, kind: "unavailable", retryAfterSeconds: 30 });
    expect(requests).toHaveLength(0);
    expect(refreshUnlocked).not.toHaveBeenCalled();
  });

  it("call_restoresTheSessionFirstWhenNoTokenIsInMemory", async () => {
    const { api, requests, refreshUnlocked, refreshWith } = setup(undefined, { signedIn: false });
    refreshWith(ok(session("at-9")));
    expect(await getMe(api)).toMatchObject({ ok: true });
    expect(refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(requests.map(bearerOf)).toEqual(["Bearer at-9"]);
  });

  it("call_refreshedButNoTokenAfterwards_answersFromTheStore", async () => {
    const { api, requests, store } = setup(() => chain401());
    vi.spyOn(store, "forceRefresh").mockResolvedValue("refreshed");
    vi.spyOn(store, "getAccessToken").mockResolvedValueOnce("at-1").mockResolvedValueOnce(null);
    store.endLocally("signed-out");
    expect(await getMe(api)).toEqual({ ok: false, kind: "signed-out" });
    expect(requests).toHaveLength(1);
  });

  it("call_storeRejects_returnsUnavailableWithoutUnhandledRejection", async () => {
    const first = setup();
    vi.spyOn(first.store, "getAccessToken").mockRejectedValue(new Error("boom"));
    expect(await getMe(first.api)).toEqual({ ok: false, kind: "unavailable" });
    expect(first.requests).toHaveLength(0);

    const second = setup(() => chain401());
    vi.spyOn(second.store, "forceRefresh").mockRejectedValue(new Error("boom"));
    expect(await getMe(second.api)).toEqual({ ok: false, kind: "unavailable" });
    expect(second.requests).toHaveLength(1);

    const third = setup(() => chain401());
    third.refreshWith(ok(session("at-2")));
    vi.spyOn(third.store, "markUnavailable").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(await getMe(third.api)).toEqual({ ok: false, kind: "unavailable" });
  });

  it("call_concurrentCalls_eachSendTheirOwnToken", async () => {
    const { api, requests, store } = setup();
    vi.spyOn(store, "getAccessToken").mockResolvedValueOnce("tok-A").mockResolvedValueOnce("tok-B");
    const gate = deferred<void>();
    // Call A builds its request only after call B has received its token and sent its request.
    const a = api.callApi(async (client) => {
      await gate.promise;
      return client.GET("/api/v1/me");
    });
    const b = api.callApi((client) => client.GET("/api/v1/staff/owner-leads"));
    await b;
    gate.resolve();
    await a;
    const byPath = Object.fromEntries(requests.map((request) => [new URL(request.url).pathname, bearerOf(request)]));
    expect(byPath).toEqual({ "/api/v1/me": "Bearer tok-A", "/api/v1/staff/owner-leads": "Bearer tok-B" });
  });

  it("call_401_afterAnotherSignInWasRestored_neverResendsWithItsToken", async () => {
    const firstAnswer = deferred<Response>();
    const { api, jar, requests, refreshUnlocked, refreshWith, store } = setup((request) =>
      bearerOf(request) === "Bearer at-1" ? firstAnswer.promise : json(200, me),
    );
    const pending = getMe(api);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    signInElsewhere(jar, store);
    refreshWith(ok(session("at-3", "u2")));
    expect(await store.getAccessToken()).toBe("at-3");
    firstAnswer.resolve(chain401());
    expect(await pending).toEqual({ ok: false, kind: "signed-out" });
    expect(requests.map(bearerOf)).toEqual(["Bearer at-1"]);
    expect(refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ status: "signed-in", user: { userId: "u2" } });
  });

  it("call_401_afterAnotherSignInNotYetRestored_neverResendsWithItsToken", async () => {
    const firstAnswer = deferred<Response>();
    const { api, jar, requests, refreshWith, store } = setup((request) =>
      bearerOf(request) === "Bearer at-1" ? firstAnswer.promise : json(200, me),
    );
    const pending = getMe(api);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    signInElsewhere(jar, store);
    // The forced refresh restores the other sign-in; its token must not answer this call.
    refreshWith(ok(session("at-3", "u2")));
    firstAnswer.resolve(chain401());
    expect(await pending).toEqual({ ok: false, kind: "signed-out" });
    expect(requests.map(bearerOf)).toEqual(["Bearer at-1"]);
    expect(store.getSnapshot().status).not.toBe("unavailable");
  });

  it("call_retry401_afterAnotherSignIn_keepsTheNewSessionAvailable", async () => {
    const retryAnswer = deferred<Response>();
    const { api, jar, requests, refreshWith, store } = setup((request) =>
      bearerOf(request) === "Bearer at-1" ? chain401() : retryAnswer.promise,
    );
    refreshWith(ok(session("at-2")));
    const pending = getMe(api);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    signInElsewhere(jar, store);
    refreshWith(ok(session("at-3", "u2")));
    expect(await store.getAccessToken()).toBe("at-3");
    retryAnswer.resolve(chain401());
    expect(await pending).toEqual({ ok: false, kind: "signed-out" });
    expect(requests.map(bearerOf)).toEqual(["Bearer at-1", "Bearer at-2"]);
    expect(store.getSnapshot()).toMatchObject({ status: "signed-in", user: { userId: "u2" } });
  });

  it("call_retry401_afterAPasswordChange_stillMarksUnavailable", async () => {
    const retryAnswer = deferred<Response>();
    const { api, requests, refreshUnlocked, refreshWith, store } = setup((request) =>
      bearerOf(request) === "Bearer at-1" ? chain401() : retryAnswer.promise,
    );
    refreshWith(ok(session("at-2")));
    const pending = getMe(api);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    // A password change in this tab adopts a newer token of the same sign-in; the second 401 still counts.
    store.adopt(session("at-5"), { newSignIn: false });
    retryAnswer.resolve(chain401());
    expect(await pending).toEqual({ ok: false, kind: "unavailable" });
    expect(refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().status).toBe("unavailable");
  });

  it("call_retry401_afterTheTokenExpiredLocally_doesNotRefreshAgain", async () => {
    const retryAnswer = deferred<Response>();
    const { api, requests, refreshUnlocked, refreshWith, store, advance } = setup((request) =>
      bearerOf(request) === "Bearer at-1" ? chain401() : retryAnswer.promise,
    );
    // A second refresh would succeed: it must not be asked for.
    refreshWith(ok(session("at-2")), ok(session("at-9")));
    const pending = getMe(api);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    // Past at-2's local expiry (received + 900 s - 30 s) while the retry is on its way.
    advance(900_000);
    retryAnswer.resolve(chain401());
    expect(await pending).toEqual({ ok: false, kind: "unavailable" });
    expect(refreshUnlocked).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().status).toBe("unavailable");
  });

  it("call_runThrows_returnsNetwork", async () => {
    const { api, store } = setup();
    const result = await api.callApi(async () => Promise.reject(new Error("bad input")));
    expect(result).toEqual({ ok: false, kind: "network" });
    expect(store.getSnapshot().status).toBe("signed-in");
  });

  it("me404_isAnErrorNotASessionEnd", async () => {
    const { api, refreshUnlocked, store } = setup(() => json(404, { code: "NOT_FOUND", message: "x", errors: [] }));
    const result = await getMe(api);
    expect(result).toMatchObject({ ok: false, kind: "http", status: 404, code: "NOT_FOUND" });
    expect(refreshUnlocked).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toMatchObject({ status: "signed-in", user: { userId: "u1" } });
    expect(store.getSnapshot().endedBy).toBeUndefined();
  });

  it("defaultInstance_importsWithAThrowingApiUrl", async () => {
    vi.resetModules();
    vi.doMock("@/config/public-env", () => ({
      publicEnv: {
        get apiUrl(): string {
          throw new Error("Missing environment variable: NEXT_PUBLIC_API_URL");
        },
      },
    }));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { callApi, apiClient } = await import("./api-client");
    expect(apiClient.callApi).toBe(callApi);
    await expect(callApi((client) => client.GET("/api/v1/me"))).resolves.toEqual({ ok: false, kind: "network" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("defaultInstance_withoutASession_returnsSignedOutWithoutRequest", async () => {
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { callApi } = await import("./api-client");
    await expect(callApi((client) => client.GET("/api/v1/me"))).resolves.toEqual({ ok: false, kind: "signed-out" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
