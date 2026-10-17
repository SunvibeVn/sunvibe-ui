import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionApi, type SessionApi, type SessionResponse } from "./session-api";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const session: SessionResponse = { accessToken: "at-1", expiresIn: 900, tokenType: "Bearer" };

type Locks = { request<T>(name: string, callback: () => Promise<T>): Promise<T> };

function setup(respond: (request: Request) => Promise<Response> | Response = () => json(200, session)) {
  const requests: Request[] = [];
  const events: string[] = [];
  const locks: Locks = {
    async request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      events.push(`lock:${name}`);
      try {
        return await callback();
      } finally {
        events.push("release");
      }
    },
  };
  const api = createSessionApi({
    baseUrl: "http://api.test",
    locks,
    fetch: async (request) => {
      requests.push(request);
      events.push(`fetch:${new URL(request.url).pathname}`);
      return respond(request);
    },
  });
  return { api, requests, events };
}

const calls: Array<[string, (api: SessionApi) => Promise<unknown>]> = [
  ["/api/v1/auth/login", (api) => api.login({ username: "0901234567", password: "secret" })],
  ["/api/v1/auth/session/refresh", (api) => api.refresh()],
  ["/api/v1/auth/session/logout", (api) => api.logout()],
  [
    "/api/v1/auth/registration",
    (api) =>
      api.register({
        username: "0901234567",
        password: "secret",
        confirmPassword: "secret",
        fullName: "A",
        registrationToken: "rt",
      }),
  ],
  [
    "/api/v1/auth/password-reset/complete",
    (api) =>
      api.completePasswordReset({ resetToken: "t", otpCode: "123456", newPassword: "n", confirmPassword: "n" }),
  ],
  [
    "/api/v1/me/password/change",
    (api) => api.changePassword("at-1", { currentPassword: "o", newPassword: "n", confirmPassword: "n" }),
  ],
  ["/api/v1/me/sessions/logout-all", (api) => api.logoutAll("at-1")],
];

afterEach(() => {
  vi.useRealTimers();
});

describe("session api (W10-25)", () => {
  it("everyCall_usesCredentialsInclude", async () => {
    const { api, requests } = setup();
    for (const [, call] of calls) await call(api);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual(calls.map(([path]) => path));
    for (const request of requests) {
      expect(request.method).toBe("POST");
      expect(request.credentials).toBe("include");
    }
    // Bearer only on password change and logout-all.
    expect(requests.map((request) => request.headers.get("Authorization"))).toEqual([
      null,
      null,
      null,
      null,
      null,
      "Bearer at-1",
      "Bearer at-1",
    ]);
  });

  it("refresh_timesOutAfter10Seconds", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const { api } = setup(
      (request) =>
        new Promise<Response>((_, reject) => {
          request.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const pending = api.refresh();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(aborted).toBe(true);
    await expect(pending).resolves.toEqual({ ok: false, kind: "network" });
  });

  it("otherCalls_timeOutAfter15Seconds", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const { api } = setup(
      (request) =>
        new Promise<Response>((_, reject) => {
          request.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const pending = api.login({ username: "0901234567", password: "secret" });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: false, kind: "network" });
  });

  // Headers arrive, the body never ends: the limit covers the whole answer, so the cookie lock is released.
  const stalledBody = () =>
    new Response(new ReadableStream({ start() {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  it("refresh_stalledBody_timesOutAfter10SecondsAndReleasesTheLock", async () => {
    vi.useFakeTimers();
    const { api, events, requests } = setup(stalledBody);
    let settled = false;
    const pending = api.refresh().finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    expect(events).not.toContain("release");
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: false, kind: "network" });
    expect(events).toEqual(["lock:sv-auth-cookie", "fetch:/api/v1/auth/session/refresh", "release"]);
    expect(requests[0].signal.aborted).toBe(true);
  });

  it("otherCalls_stalledBody_timeOutAfter15SecondsAndReleaseTheLock", async () => {
    vi.useFakeTimers();
    for (const [path, call] of calls) {
      const { api, events } = setup(stalledBody);
      let settled = false;
      const pending = call(api).finally(() => {
        settled = true;
      });
      const limit = path === "/api/v1/auth/session/refresh" ? 10_000 : 15_000;
      await vi.advanceTimersByTimeAsync(limit - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({ ok: false, kind: "network" });
      expect(events.at(-1)).toBe("release");
    }
  });

  it("logout_isSentWithKeepalive", async () => {
    const { api, requests } = setup(() => new Response(null, { status: 204 }));
    const result = await api.logout();
    expect(result).toMatchObject({ ok: true, status: 204 });
    expect(requests[0].keepalive).toBe(true);
    await api.refresh();
    expect(requests[1].keepalive).toBe(false);
  });

  it("login_401_returnsCodeInvalidCredentials", async () => {
    const { api } = setup(() => json(401, { code: "INVALID_CREDENTIALS", message: "Wrong phone or password" }));
    const result = await api.login({ username: "0901234567", password: "wrong" });
    expect(result).toMatchObject({ ok: false, kind: "http", status: 401, code: "INVALID_CREDENTIALS" });
  });

  it("everyCall_runsInsideTheLock", async () => {
    for (const [path, call] of calls) {
      const { api, events } = setup();
      await call(api);
      expect(events).toEqual(["lock:sv-auth-cookie", `fetch:${path}`, "release"]);
    }
  });

  it("login_200_returnsTheSession", async () => {
    const { api, requests } = setup();
    const result = await api.login({ username: "0901234567", password: "secret" });
    expect(result).toMatchObject({ ok: true, status: 200, data: session });
    expect(requests[0].headers.get("Content-Type")).toContain("application/json");
    expect(await requests[0].json()).toEqual({ username: "0901234567", password: "secret" });
  });

  it("register_201_returnsTheSession", async () => {
    const { api } = setup(() => json(201, session));
    const result = await api.register({
      username: "0901234567",
      password: "secret",
      confirmPassword: "secret",
      fullName: "A",
      registrationToken: "rt",
    });
    expect(result).toMatchObject({ ok: true, status: 201, data: session });
  });

  it("bodylessCalls_sendNoBody", async () => {
    const { api, requests } = setup(() => new Response(null, { status: 204 }));
    await api.refresh();
    await api.logout();
    await api.logoutAll("at-1");
    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request.body).toBeNull();
      expect(await request.text()).toBe("");
    }
  });

  it("refreshUnlocked_doesNotTakeTheLock", async () => {
    vi.useFakeTimers();
    const { api, requests, events } = setup((request) =>
      new Promise<Response>((_, reject) =>
        request.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      ),
    );
    const pending = api.refreshUnlocked();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({ ok: false, kind: "network" });
    expect(events).toEqual(["fetch:/api/v1/auth/session/refresh"]);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].credentials).toBe("include");
  });

  it("logoutUnlocked_doesNotTakeTheLock", async () => {
    vi.useFakeTimers();
    const { api, requests, events } = setup((request) =>
      new Promise<Response>((_, reject) =>
        request.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      ),
    );
    const pending = api.logoutUnlocked();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(requests[0].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: false, kind: "network" });
    expect(events).toEqual(["fetch:/api/v1/auth/session/logout"]);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].credentials).toBe("include");
    expect(requests[0].keepalive).toBe(true);
  });

  it("logout_takesTheLockAroundTheUnlockedCall", async () => {
    const { api, events } = setup(() => new Response(null, { status: 204 }));
    await expect(api.logout()).resolves.toMatchObject({ ok: true, status: 204 });
    expect(events).toEqual(["lock:sv-auth-cookie", "fetch:/api/v1/auth/session/logout", "release"]);
  });
});

describe("default sessionApi", () => {
  afterEach(() => {
    vi.doUnmock("@/config/public-env");
    vi.resetModules();
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
    const { sessionApi } = await import("./session-api");
    await expect(sessionApi.refresh()).rejects.toThrow("NEXT_PUBLIC_API_URL");
    await expect(sessionApi.login({ username: "u", password: "p" })).rejects.toThrow("NEXT_PUBLIC_API_URL");
  });
});
