import { afterEach, describe, expect, it, vi } from "vitest";

import { isLogoutPending, readHint } from "./browser-cookies";
import type { SessionApi, SessionResponse } from "./session-api";

type LogoutResult = Awaited<ReturnType<SessionApi["logoutUnlocked"]>>;
type RefreshResult = Awaited<ReturnType<SessionApi["refreshUnlocked"]>>;

// The default store is checked against a fake default API (auth-browser-session S-25, W10-27).
const defaultApi = vi.hoisted(() => ({
  refreshUnlocked: vi.fn<() => Promise<RefreshResult>>(),
  logoutUnlocked: vi.fn<() => Promise<LogoutResult>>(),
  logout: vi.fn<() => Promise<LogoutResult>>(),
}));
vi.mock("./session-api", () => ({ sessionApi: defaultApi }));

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

function session(userId: string, accessToken: string): SessionResponse {
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("default session store", () => {
  it("identityChange_endsBothSessionsWithTheDefaultApi", async () => {
    const jar = new FakeJar();
    jar.put("sv_signed_in", "gen-1");
    vi.stubGlobal("document", jar);
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("BroadcastChannel", undefined);
    defaultApi.refreshUnlocked
      .mockResolvedValueOnce({ ok: true, data: session("u1", "at-1"), status: 200, replayed: false })
      .mockResolvedValueOnce({ ok: true, data: session("u2", "at-2"), status: 200, replayed: false });
    let flagAtCall: boolean | undefined;
    defaultApi.logoutUnlocked.mockImplementationOnce(async () => {
      flagAtCall = isLogoutPending(jar);
      return { ok: true, data: undefined, status: 204, replayed: false };
    });
    const { sessionStore } = await import("./session-store");

    await expect(sessionStore.getAccessToken()).resolves.toBe("at-1");
    await expect(sessionStore.forceRefresh("at-1")).resolves.toBe("ended");

    expect(defaultApi.logoutUnlocked).toHaveBeenCalledTimes(1);
    expect(defaultApi.logout).not.toHaveBeenCalled();
    expect(flagAtCall).toBe(true);
    expect(isLogoutPending(jar)).toBe(false);
    expect(readHint(jar)).toBeNull();
    expect(sessionStore.getSnapshot()).toEqual({ status: "signed-out", user: null, endedBy: "signed-out" });
  });
});
