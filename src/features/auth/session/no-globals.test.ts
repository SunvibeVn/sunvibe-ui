import { afterEach, describe, expect, it, vi } from "vitest";

// auth-browser-session §10.2, W10-47: no client, store or token on `window` or another global. The default instances
// are imported and one restore runs against a fake API; afterwards the global object has no new key and holds no
// value equal to the token.

const TOKEN = "at-never-on-a-global-7f3a";

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
}

class FakeChannel {
  readonly posted: unknown[] = [];
  constructor(readonly name: string) {}
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

const sessionBody = {
  accessToken: TOKEN,
  expiresIn: 900,
  tokenType: "Bearer",
  user: {
    userId: "u1",
    fullName: "Nguyen Van A",
    username: "0901234567",
    roles: ["CUSTOMER"],
    phoneVerified: true,
    emailVerified: false,
  },
};

function globalValues(): Array<[string, unknown]> {
  return Object.getOwnPropertyNames(globalThis).map((key) => {
    try {
      return [key, (globalThis as Record<string, unknown>)[key]];
    } catch {
      return [key, undefined];
    }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("nothing of the session on a global (W10-47)", () => {
  it("defaultInstances_restore_addNoGlobalAndNoTokenValue", async () => {
    const jar = new FakeJar();
    jar.cookie = "sv_signed_in=gen-1; Path=/";
    vi.stubGlobal("document", jar);
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (path === "/api/v1/auth/session/refresh") {
          return new Response(JSON.stringify(sessionBody), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ userId: "u1" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    vi.resetModules();
    const keysBefore = new Set(Object.getOwnPropertyNames(globalThis));

    const { sessionStore } = await import("./session-store");
    const { callApi } = await import("./api-client");
    await import("./session-api");

    await expect(sessionStore.getAccessToken()).resolves.toBe(TOKEN);
    const me = await callApi((client) => client.GET("/api/v1/me"));
    expect(me.ok).toBe(true);

    const added = Object.getOwnPropertyNames(globalThis).filter((key) => !keysBefore.has(key));
    expect(added).toEqual([]);
    const holdingToken = globalValues()
      .filter(([, value]) => value === TOKEN || (typeof value === "string" && value.includes(TOKEN)))
      .map(([key]) => key);
    expect(holdingToken).toEqual([]);
    // Nor in a cookie this script can read.
    expect(jar.cookie.includes(TOKEN)).toBe(false);
  });
});
