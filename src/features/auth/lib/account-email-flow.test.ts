import { describe, expect, it, vi } from "vitest";
import type { Client } from "openapi-fetch";
import type { paths } from "@/api/generated/schema";
import type { ClientResponse } from "@/lib/api";
import type { ApiCall, ApiResult, CallApi, CallOptions } from "../session/api-client";
import type { BrowserEnvironment } from "../session/browser-cookies";
import type { EmailBindStore, SessionResponse } from "../session/session-api";
import type { SessionSnapshot, SignInRef } from "../session/session-store";
import {
  type AccountEmailDeps,
  type BindStep,
  confirmBindCode,
  resendBindCode,
  sendBindCode,
} from "./account-email-flow";
import { memoryStorage } from "./test-support/memory-storage";

const COOKIE_TEXT =
  "Sunvibe needs cookies to keep you signed in. Turn on cookies for sunvibe.vn in your browser settings, then reload this page.";
const NOT_AVAILABLE = "This email can't be used right now. Try another email or contact Sunvibe.";
const SESSION_CHANGED = "Your session changed. Please start again.";

const START: SignInRef = { generation: "gen-1", userId: "u-1" };
const VALUES = { newEmail: " An@Sunvibe.VN", currentPassword: " Secret@2026 " };
const STEP: BindStep = {
  newEmail: "an@sunvibe.vn",
  sentTo: "a***@sunvibe.vn",
  resendAvailableAt: "2026-11-05T10:01:00Z",
  start: START,
};

type Sent = { path: string; body?: unknown };

function ok<T>(data: T, status = 200) {
  return { ok: true, data, status, replayed: false } as const;
}

function http(status: number, code?: string, extra: { retryAfterSeconds?: number; field?: string; text?: string } = {}) {
  return {
    ok: false,
    kind: "http",
    status,
    code,
    fieldErrors: extra.field ? [{ field: extra.field, message: extra.text ?? "refused" }] : [],
    retryAfterSeconds: extra.retryAfterSeconds,
  } as const;
}

const session = (userId = "u-1"): SessionResponse => ({
  accessToken: "at-2",
  expiresIn: 900,
  tokenType: "Bearer",
  user: { userId, requiredAction: null },
});

type Setup = {
  send?: ApiResult<unknown>;
  confirm?: Awaited<ReturnType<AccountEmailDeps["api"]["confirmEmailBind"]>>;
  cookiesEnabled?: boolean;
};

function setup({
  send = ok({ channel: "EMAIL", sentTo: "a***@sunvibe.vn", resendAvailableAt: STEP.resendAvailableAt }),
  confirm = ok(session()),
  cookiesEnabled = true,
}: Setup = {}) {
  const sent: Sent[] = [];
  const options: Array<CallOptions | undefined> = [];
  const storage = memoryStorage();
  const env: BrowserEnvironment = {
    navigator: { cookieEnabled: cookiesEnabled },
    document: { cookie: "a=1" },
    sessionStorage: storage,
  };
  const fakeClient = {
    POST: async (path: string, init?: { body?: unknown }): Promise<ClientResponse<unknown>> => {
      sent.push({ path, body: init?.body });
      return { response: new Response(null, { status: 200 }) };
    },
  } as unknown as Client<paths>;
  const callApi: CallApi = async <T,>(run: ApiCall<T>, callOptions?: CallOptions): Promise<ApiResult<T>> => {
    options.push(callOptions);
    await run(fakeClient);
    return send as ApiResult<T>;
  };
  let snapshot: SessionSnapshot = {
    status: "signed-in",
    user: {
      userId: "u-1",
      fullName: "An",
      username: "0901234567",
      roles: [],
      phoneVerified: true,
      emailVerified: false,
      requiredAction: "BIND_EMAIL",
    },
  };
  const store = {
    generation: vi.fn((): string | null => START.generation),
    getSnapshot: () => snapshot,
    getAccessToken: vi.fn(async (): Promise<string | null> => "at-1"),
    forceRefresh: vi.fn(async () => "refreshed" as const),
    isSignIn: vi.fn<EmailBindStore["isSignIn"]>(() => true),
    adopt: vi.fn(),
    markUnavailable: vi.fn(),
  };
  const api = { confirmEmailBind: vi.fn(async () => confirm) };
  const deps: AccountEmailDeps = { callApi, api, store, env };
  return {
    deps,
    api,
    store,
    sent,
    options,
    storage,
    signOut() {
      snapshot = { status: "signed-out", user: null };
    },
  };
}

describe("sendBindCode (auth-email-access spec 4.9, 6.2)", () => {
  it("sends the canonical address and the password as typed, with the 30 s deadline", async () => {
    const t = setup();
    await sendBindCode(VALUES, t.deps);
    expect(t.sent).toEqual([
      { path: "/api/v1/me/email/send-code", body: { newEmail: "an@sunvibe.vn", currentPassword: " Secret@2026 " } },
    ]);
    expect(t.options).toEqual([{ timeoutMs: 30_000 }]);
  });

  it("moves to the code step, tied to the sign-in it started under", async () => {
    const t = setup();
    expect(await sendBindCode(VALUES, t.deps)).toEqual({ status: "success", step: STEP });
  });

  it("bind_reload_restarts_noProofStored", async () => {
    const t = setup();
    await sendBindCode(VALUES, t.deps);
    // The step lives in the component only: a reload starts over, and no address, code or password stays behind.
    expect(t.storage.length).toBe(0);
  });

  it("bind_wrongPassword_fieldError", async () => {
    const t = setup({
      send: http(400, "VALIDATION_FAILED", { field: "currentPassword", text: "Current password is incorrect." }),
    });
    const state = await sendBindCode(VALUES, t.deps);
    expect(state).toEqual({
      status: "error",
      fieldErrors: { currentPassword: ["Current password is incorrect."] },
      values: { newEmail: VALUES.newEmail },
    });
    expect(JSON.stringify(state)).not.toContain("Secret");
  });

  it("bind_423_retryAfter", async () => {
    const t = setup({ send: http(423, "ACCOUNT_LOCKED", { retryAfterSeconds: 300 }) });
    expect(await sendBindCode(VALUES, t.deps)).toMatchObject({
      status: "error",
      message: "Too many failed attempts. Try again in 5 minutes.",
    });
  });

  it("uses Retry-After on a 429", async () => {
    const t = setup({ send: http(429, "CODE_RESEND_TOO_SOON", { retryAfterSeconds: 45 }) });
    expect(await sendBindCode(VALUES, t.deps)).toMatchObject({
      message: "Too many requests. Please wait 45 seconds and try again.",
    });
  });

  it("a mail failure stays on the form, ready for a retry", async () => {
    const t = setup({ send: http(503, "EMAIL_DELIVERY_FAILED", { retryAfterSeconds: 60 }) });
    expect(await sendBindCode(VALUES, t.deps)).toEqual({
      status: "error",
      message: "We couldn't send the email. Try again in a minute.",
      values: { newEmail: VALUES.newEmail },
    });
  });

  it("says when the address already is the account's email", async () => {
    const t = setup({ send: http(400, "ALREADY_VERIFIED") });
    expect(await sendBindCode(VALUES, t.deps)).toEqual({
      status: "error",
      fieldErrors: { newEmail: ["This is already your email."] },
      values: { newEmail: VALUES.newEmail },
    });
  });

  it("refuses what the policy refuses without a call", async () => {
    const t = setup();
    const state = await sendBindCode({ newEmail: "an@sunvibe", currentPassword: "" }, t.deps);
    expect(state).toMatchObject({
      status: "error",
      fieldErrors: { newEmail: ["Enter a valid email address."], currentPassword: ["Enter your password."] },
    });
    expect(t.sent).toEqual([]);
  });

  it("refuses to send when cookies or storage are blocked", async () => {
    const t = setup({ cookiesEnabled: false });
    expect(await sendBindCode(VALUES, t.deps)).toEqual({
      status: "error",
      message: COOKIE_TEXT,
      values: { newEmail: VALUES.newEmail },
    });
    expect(t.sent).toEqual([]);
  });

  it.each([{ ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as const)(
    "leaves $kind to the session",
    async (send) => {
      const t = setup({ send });
      expect(await sendBindCode(VALUES, t.deps)).toEqual({ status: "idle", values: { newEmail: VALUES.newEmail } });
    },
  );

  it("sends nothing when nobody is signed in", async () => {
    const t = setup();
    t.signOut();
    expect(await sendBindCode(VALUES, t.deps)).toEqual({ status: "idle", values: { newEmail: VALUES.newEmail } });
    expect(t.sent).toEqual([]);
  });

  it("drops the answer when the account changed meanwhile", async () => {
    const t = setup();
    t.store.isSignIn.mockReturnValue(false);
    expect(await sendBindCode(VALUES, t.deps)).toEqual({ status: "error", message: SESSION_CHANGED });
  });
});

describe("resendBindCode", () => {
  it("bind_resend_asksPasswordAgain", () => {
    // A new code costs the password again: an open session alone binds nothing (spec 6.2, S-21).
    expect(resendBindCode(STEP)).toEqual({ status: "idle", values: { newEmail: "an@sunvibe.vn" } });
  });
});

describe("confirmBindCode (auth-email-access spec 6.3, U-8)", () => {
  it("bind_success_adoptsSession", async () => {
    const response = session();
    const t = setup({ confirm: ok(response) });
    expect(await confirmBindCode({ code: "123456" }, STEP, t.deps)).toEqual({ redirect: "/account?email=bound" });
    expect(t.api.confirmEmailBind).toHaveBeenCalledExactlyOnceWith(
      "at-1",
      { newEmail: "an@sunvibe.vn", code: "123456" },
      expect.any(Function),
    );
    expect(t.store.adopt).toHaveBeenCalledExactlyOnceWith(response, { newSignIn: true });
  });

  it("refuses a code that is not six digits without a call", async () => {
    const t = setup();
    expect(await confirmBindCode({ code: "12" }, STEP, t.deps)).toMatchObject({
      status: "error",
      fieldErrors: { code: ["Enter the 6-digit code."] },
    });
    expect(t.api.confirmEmailBind).not.toHaveBeenCalled();
  });

  it.each([
    ["CODE_INCORRECT", "Incorrect verification code."],
    ["CODE_EXPIRED", "The verification code is invalid or has expired. Please request a new one."],
    ["CODE_ATTEMPTS_EXCEEDED", "Too many incorrect codes. Please request a new one."],
  ])("explains %s and stays on the step", async (code, message) => {
    const t = setup({ confirm: http(400, code) });
    expect(await confirmBindCode({ code: "123456" }, STEP, t.deps)).toEqual({ status: "error", message });
  });

  it("bind_notAvailable_message", async () => {
    const t = setup({ confirm: http(409, "EMAIL_NOT_AVAILABLE") });
    // The code is used up, so the form goes back to the address.
    expect(await confirmBindCode({ code: "123456" }, STEP, t.deps)).toEqual({
      status: "error",
      message: NOT_AVAILABLE,
      restart: true,
    });
    expect(t.store.adopt).not.toHaveBeenCalled();
  });

  it("makes no call after an account change, and asks to start again", async () => {
    const t = setup();
    t.store.isSignIn.mockReturnValue(false);
    expect(await confirmBindCode({ code: "123456" }, STEP, t.deps)).toEqual({
      status: "error",
      message: SESSION_CHANGED,
      restart: true,
    });
    expect(t.api.confirmEmailBind).not.toHaveBeenCalled();
  });

  it("a late answer changes nothing", async () => {
    const t = setup({ confirm: ok(session("someone-else")) });
    await confirmBindCode({ code: "123456" }, STEP, t.deps);
    expect(t.store.adopt).not.toHaveBeenCalled();
  });

  it("leaves a session that ended to the session screens", async () => {
    const t = setup({ confirm: http(401) });
    t.store.forceRefresh.mockResolvedValue("ended" as never);
    expect(await confirmBindCode({ code: "123456" }, STEP, t.deps)).toEqual({ status: "idle" });
  });

  it("refuses to send when cookies or storage are blocked", async () => {
    const t = setup({ cookiesEnabled: false });
    expect(await confirmBindCode({ code: "123456" }, STEP, t.deps)).toEqual({ status: "error", message: COOKIE_TEXT });
    expect(t.api.confirmEmailBind).not.toHaveBeenCalled();
  });

  it("shows a network failure and keeps the step for a retry", async () => {
    const t = setup({ confirm: { ok: false, kind: "network" } });
    expect(await confirmBindCode({ code: "123456" }, STEP, t.deps)).toEqual({
      status: "error",
      message: "We couldn't reach the server. Please try again.",
    });
  });
});
