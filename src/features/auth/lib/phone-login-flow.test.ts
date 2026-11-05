import { describe, expect, it, vi } from "vitest";
import type { PublicApiResult } from "@/lib/api";
import type { BrowserEnvironment } from "../session/browser-cookies";
import type { SessionResponse } from "../session/session-api";
import type { RequiredAction, SessionSnapshot } from "../session/session-store";
import type { LoginDeps } from "./login-flow";
import { submitPhoneLogin } from "./phone-login-flow";
import { memoryStorage } from "./test-support/memory-storage";

type LoginResult = PublicApiResult<SessionResponse>;

const session = (requiredAction: RequiredAction | null = null): SessionResponse => ({
  accessToken: "access-token",
  expiresIn: 900,
  tokenType: "Bearer",
  user: { userId: "u-1", fullName: "An Nguyen", username: "0901234567", roles: ["CUSTOMER"], requiredAction },
});

const ok = (data: SessionResponse): LoginResult => ({ ok: true, data, status: 200, replayed: false });

function setup(answer: LoginResult = ok(session())) {
  const jar = { cookie: "" };
  const env: BrowserEnvironment = { navigator: { cookieEnabled: true }, document: { cookie: "a=1" }, sessionStorage: memoryStorage() };
  let snapshot: SessionSnapshot = { status: "signed-out", user: null };
  const login = vi.fn(async (): Promise<LoginResult> => answer);
  const store: LoginDeps["store"] = {
    adopt: vi.fn((response) => {
      snapshot = {
        status: "signed-in",
        user: {
          userId: "u-1",
          fullName: "",
          username: null,
          roles: [],
          phoneVerified: false,
          emailVerified: false,
          requiredAction: response.user?.requiredAction ?? null,
        },
      };
    }),
    getSnapshot: () => snapshot,
  };
  const deps = { api: { login }, store, jar, env, settlePending: async () => undefined } as unknown as LoginDeps;
  return { login, store, deps };
}

describe("submitPhoneLogin", () => {
  it("phoneLogin_legacy_skipsParser", async () => {
    // A value the parser refuses, in the old shape: a row without a key is found by its stored string (D4-7).
    const { login, deps } = setup();
    await submitPhoneLogin({ username: "012 3456 7890", password: "pw" }, "legacy-login", deps);
    expect(login).toHaveBeenCalledExactlyOnceWith({ username: "01234567890", password: "pw" });
  });

  it("legacy still refuses what could never be a stored number", async () => {
    const { login, deps } = setup();
    const state = await submitPhoneLogin({ username: "12", password: "pw" }, "legacy-login", deps);
    expect(state).toMatchObject({ status: "error", fieldErrors: { username: [expect.any(String)] } });
    expect(login).not.toHaveBeenCalled();
  });

  it("on uses the policy: a number the parser refuses is not sent", async () => {
    const { login, deps } = setup();
    const state = await submitPhoneLogin({ username: "0123456789", password: "pw" }, "on", deps);
    expect(state).toMatchObject({ status: "error", fieldErrors: { username: ["Enter a valid phone number."] } });
    expect(login).not.toHaveBeenCalled();
  });

  it("on sends the national form of any accepted form", async () => {
    const { login, deps } = setup();
    await submitPhoneLogin({ username: "+84 90 123 4567", password: "pw" }, "on", deps);
    expect(login).toHaveBeenCalledExactlyOnceWith({ username: "0901234567", password: "pw" });
  });

  it("keeps the phone text of a wrong sign-in", async () => {
    const { deps } = setup({ ok: false, kind: "http", status: 401, code: "INVALID_CREDENTIALS", fieldErrors: [] });
    expect(await submitPhoneLogin({ username: "0901234567", password: "pw" }, "on", deps)).toEqual({
      status: "error",
      message: "Phone number or password is incorrect.",
      values: { username: "0901234567" },
    });
  });

  it("a phone-only account goes on to bind an email", async () => {
    const { deps } = setup(ok(session("BIND_EMAIL")));
    const outcome = await submitPhoneLogin({ username: "0901234567", password: "pw", next: "/account" }, "legacy-login", deps);
    expect(outcome).toEqual({ redirect: "/account/email" });
  });

  it("goes to /verify-phone when the server asks for it", async () => {
    const { deps } = setup(ok(session("VERIFY_PHONE")));
    expect(await submitPhoneLogin({ username: "0901234567", password: "pw" }, "on", deps)).toEqual({
      redirect: "/verify-phone",
    });
  });

  it("keeps `next` when nothing is asked of the account", async () => {
    const { deps } = setup();
    const outcome = await submitPhoneLogin({ username: "0901234567", password: "pw", next: "/account?tab=1" }, "on", deps);
    expect(outcome).toEqual({ redirect: "/account?tab=1" });
  });
});
