import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldError, PublicApiHttpError, PublicApiResult } from "@/lib/api";
import { type BrowserEnvironment, pendingCookieName } from "../session/browser-cookies";
import { settlePendingLogoutBeforeSignIn } from "../session/logout";
import type { SessionResponse } from "../session/session-api";
import type { SessionSnapshot } from "../session/session-store";
import {
  type CodeSentResponse,
  type RegistrationApi,
  type SignUpDeps,
  completeSignUp,
  createRegistrationApi,
  resendSignUpCode,
  startSignUp,
  verifySignUpCode,
} from "./sign-up-flow";
import { readSignUpProgress, writeSignUpProgress } from "./signup-progress";
import { memoryStorage } from "./test-support/memory-storage";

const COOKIE_TEXT =
  "Sunvibe needs cookies to keep you signed in. Turn on cookies for sunvibe.vn in your browser settings, then reload this page.";
const GENERIC = "We couldn't reach the server. Please try again.";

class FakeJar {
  private readonly store = new Map<string, string>();
  constructor(private readonly enabled = true) {}

  get cookie(): string {
    return [...this.store].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  set cookie(raw: string) {
    if (!this.enabled) return;
    const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
    const separator = pair.indexOf("=");
    const expired = attributes.some((attribute) => attribute.toLowerCase() === "max-age=0");
    if (expired) this.store.delete(pair.slice(0, separator));
    else this.store.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

function ok<T>(data: T, status = 200): PublicApiResult<T> {
  return { ok: true, data, status, replayed: false };
}

function fail(status: number, code?: string, extra: { fieldErrors?: FieldError[]; retryAfterSeconds?: number } = {}) {
  const error: PublicApiHttpError = {
    ok: false,
    kind: "http",
    status,
    code,
    fieldErrors: extra.fieldErrors ?? [],
    retryAfterSeconds: extra.retryAfterSeconds,
  };
  return error;
}

const TAKEN = [{ field: "username", message: "Phone number is already in use." }];

function session(phoneVerified: boolean): SessionResponse {
  return {
    accessToken: "access-token",
    expiresIn: 900,
    tokenType: "Bearer",
    user: {
      userId: "u-1",
      fullName: "Nguyen Van An",
      username: "0901234567",
      roles: ["TENANT"],
      phoneVerified,
      emailVerified: false,
    },
  } as SessionResponse;
}

const sent = (resendAvailableAt = inMinutes(1)): CodeSentResponse => ({
  channel: "PHONE",
  sentTo: "090****567",
  expiresAt: inMinutes(10),
  resendAvailableAt,
});

function setup({
  cookiesEnabled = true,
  pendingLogout = false,
  adoptWorks = true,
}: { cookiesEnabled?: boolean; pendingLogout?: boolean; adoptWorks?: boolean } = {}) {
  const calls: string[] = [];
  const jar = new FakeJar(cookiesEnabled);
  if (pendingLogout) jar.cookie = `${pendingCookieName()}=1; Path=/`;
  const storage = memoryStorage();
  const env: BrowserEnvironment = { navigator: { cookieEnabled: cookiesEnabled }, document: jar, sessionStorage: storage };
  let snapshot: SessionSnapshot = { status: "signed-out", user: null };

  const registration = {
    sendCode: vi.fn<RegistrationApi["sendCode"]>(async () => {
      calls.push("send-code");
      return ok(sent());
    }),
    verifyCode: vi.fn<RegistrationApi["verifyCode"]>(async () => {
      calls.push("verify-code");
      return ok({ registrationToken: "token-1", expiresAt: inMinutes(15) });
    }),
  };
  const api = {
    register: vi.fn<SignUpDeps["api"]["register"]>(async () => {
      calls.push("register");
      return ok(session(true), 201);
    }),
    logout: vi.fn(async () => {
      calls.push("logout");
      return { ok: true, data: undefined, status: 204, replayed: false } as const;
    }),
  };
  const store = {
    adopt: vi.fn<SignUpDeps["store"]["adopt"]>((response) => {
      calls.push("adopt");
      const user = response.user;
      if (!adoptWorks || !user) {
        snapshot = { status: "unavailable", user: null };
        return;
      }
      snapshot = {
        status: "signed-in",
        user: {
          userId: user.userId ?? "",
          fullName: user.fullName ?? "",
          username: user.username ?? "",
          roles: user.roles ?? [],
          phoneVerified: user.phoneVerified ?? false,
          emailVerified: user.emailVerified ?? false,
        },
      };
    }),
    getSnapshot: () => snapshot,
  };
  const deps: SignUpDeps = {
    env,
    registration,
    api: api as unknown as SignUpDeps["api"],
    store,
    jar,
    settlePending: settlePendingLogoutBeforeSignIn,
  };
  return { registration, api, store, jar, storage, deps, calls };
}

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
});

describe("createRegistrationApi (anonymous calls, auth-browser-session R-1)", () => {
  function recorder(status = 200, body: unknown = {}) {
    const requests: Request[] = [];
    const fetch = vi.fn(async (request: Request) => {
      requests.push(request);
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    });
    return { requests, api: createRegistrationApi({ baseUrl: "http://api.test", fetch }) };
  }

  it("registrationApi_sendCode_postsThePhoneWithoutCredentials", async () => {
    const { requests, api } = recorder(200, { channel: "PHONE", sentTo: "*******567" });
    const result = await api.sendCode("0901234567");
    expect(result).toMatchObject({ ok: true, data: { channel: "PHONE", sentTo: "*******567" } });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("http://api.test/api/v1/auth/registration/phone/send-code");
    expect(requests[0].credentials).toBe("omit");
    expect(requests[0].headers.get("Authorization")).toBeNull();
    expect(await requests[0].json()).toEqual({ phoneNumber: "0901234567" });
  });

  it("registrationApi_verifyCode_postsThePhoneAndCodeWithoutCredentials", async () => {
    const { requests, api } = recorder(200, { registrationToken: "reg-1" });
    await api.verifyCode("0901234567", "123456");
    expect(requests[0].url).toBe("http://api.test/api/v1/auth/registration/phone/verify-code");
    expect(requests[0].credentials).toBe("omit");
    expect(await requests[0].json()).toEqual({ phoneNumber: "0901234567", code: "123456" });
  });

  it("registrationApi_clientBuildThrows_answersNetwork", async () => {
    const api = createRegistrationApi({}, () => {
      throw new Error("missing API URL");
    });
    await expect(api.sendCode("0901234567")).resolves.toEqual({ ok: false, kind: "network" });
    await expect(api.verifyCode("0901234567", "123456")).resolves.toEqual({ ok: false, kind: "network" });
  });
});

describe("startSignUp", () => {
  it("startSignUp_cookiesBlocked_sendsNothing", async () => {
    t = setup({ cookiesEnabled: false });
    const outcome = await startSignUp({ username: "0901234567" }, t.deps);
    expect(outcome).toMatchObject({ status: "error", message: COOKIE_TEXT });
    expect(t.registration.sendCode).not.toHaveBeenCalled();
  });

  it("rejects a bad phone number without calling the backend", async () => {
    const outcome = await startSignUp({ username: "12345" }, t.deps);
    expect(outcome).toMatchObject({ fieldErrors: { username: ["Enter a phone number of 10 to 12 digits."] } });
    expect(t.registration.sendCode).not.toHaveBeenCalled();
  });

  it("sends the normalized number, keeps progress in sessionStorage and moves to the code step", async () => {
    const resendAvailableAt = inMinutes(1);
    t.registration.sendCode.mockResolvedValue(ok(sent(resendAvailableAt)));

    const outcome = await startSignUp({ username: "090 123 4567" }, t.deps);

    expect(outcome).toEqual({ redirect: "/sign-up/verify" });
    expect(t.registration.sendCode).toHaveBeenCalledWith("0901234567");
    expect(readSignUpProgress(t.storage)).toEqual({ phone: "0901234567", resendAvailableAt });
  });

  it("shows a taken number under the phone field and keeps what was typed", async () => {
    t.registration.sendCode.mockResolvedValue(fail(400, "VALIDATION_FAILED", { fieldErrors: TAKEN }));
    const outcome = await startSignUp({ username: "0901234567" }, t.deps);
    expect(outcome).toEqual({
      status: "error",
      fieldErrors: { username: ["Phone number is already in use."] },
      values: { username: "0901234567" },
    });
    expect(readSignUpProgress(t.storage)).toBeNull();
  });

  it("shows a phoneNumber field error under the phone input too", async () => {
    t.registration.sendCode.mockResolvedValue(
      fail(400, "VALIDATION_FAILED", { fieldErrors: [{ field: "phoneNumber", message: "Invalid phone number." }] }),
    );
    const outcome = await startSignUp({ username: "0901234567" }, t.deps);
    expect(outcome).toMatchObject({ fieldErrors: { username: ["Invalid phone number."] } });
  });

  it("tells how long to wait when the backend throttles the SMS", async () => {
    t.registration.sendCode.mockResolvedValue(fail(429, "CODE_RESEND_TOO_SOON", { retryAfterSeconds: 45 }));
    const outcome = await startSignUp({ username: "0901234567" }, t.deps);
    expect(outcome).toMatchObject({ message: "Too many requests. Please wait 45 seconds and try again." });
  });

  it("shows the generic text when the server cannot be reached", async () => {
    t.registration.sendCode.mockResolvedValue({ ok: false, kind: "network" });
    const outcome = await startSignUp({ username: "0901234567" }, t.deps);
    expect(outcome).toMatchObject({ status: "error", message: GENERIC });
  });

  it("does not send another SMS when the same number is still waiting for its code", async () => {
    writeSignUpProgress(t.storage, { phone: "0901234567", resendAvailableAt: inMinutes(1) });
    const outcome = await startSignUp({ username: "0901234567" }, t.deps);
    expect(outcome).toEqual({ redirect: "/sign-up/verify" });
    expect(t.registration.sendCode).not.toHaveBeenCalled();
  });

  it("resumes at the details step when the number was already verified", async () => {
    writeSignUpProgress(t.storage, { phone: "0901234567", registrationToken: "t", tokenExpiresAt: inMinutes(10) });
    const outcome = await startSignUp({ username: "0901234567" }, t.deps);
    expect(outcome).toEqual({ redirect: "/sign-up/details" });
    expect(t.registration.sendCode).not.toHaveBeenCalled();
  });

  it("a new code from the first step starts a new 30-minute lifetime of the progress", async () => {
    const start = Date.parse("2026-10-18T10:00:00Z");
    vi.useFakeTimers({ now: start });
    try {
      writeSignUpProgress(t.storage, { phone: "0901234567", resendAvailableAt: inMinutes(1) });
      vi.setSystemTime(start + 20 * 60_000);
      t.registration.sendCode.mockResolvedValue(ok(sent(inMinutes(1))));
      expect(await startSignUp({ username: "0901234567" }, t.deps)).toEqual({ redirect: "/sign-up/verify" });
      expect(t.registration.sendCode).toHaveBeenCalledTimes(1);
      vi.setSystemTime(start + 45 * 60_000);
      expect(readSignUpProgress(t.storage)?.phone).toBe("0901234567");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends a fresh code for a different number", async () => {
    writeSignUpProgress(t.storage, { phone: "0901234567", resendAvailableAt: inMinutes(1) });
    const outcome = await startSignUp({ username: "0987654321" }, t.deps);
    expect(outcome).toEqual({ redirect: "/sign-up/verify" });
    expect(t.registration.sendCode).toHaveBeenCalledWith("0987654321");
    expect(readSignUpProgress(t.storage)?.phone).toBe("0987654321");
  });
});

describe("resendSignUpCode", () => {
  it("goes back to the first step when there is no sign-up in progress", async () => {
    expect(await resendSignUpCode(t.deps)).toEqual({ redirect: "/sign-up" });
    expect(t.registration.sendCode).not.toHaveBeenCalled();
  });

  it("goes on to the details step when the number is already verified", async () => {
    writeSignUpProgress(t.storage, { phone: "0901234567", registrationToken: "t", tokenExpiresAt: inMinutes(10) });
    expect(await resendSignUpCode(t.deps)).toEqual({ redirect: "/sign-up/details" });
    expect(t.registration.sendCode).not.toHaveBeenCalled();
  });

  it("sends a new code to the number in progress and reports when to try again", async () => {
    writeSignUpProgress(t.storage, { phone: "0901234567" });
    const resendAvailableAt = inMinutes(1);
    t.registration.sendCode.mockResolvedValue(ok(sent(resendAvailableAt)));

    const outcome = await resendSignUpCode(t.deps);

    expect(t.registration.sendCode).toHaveBeenCalledWith("0901234567");
    expect(outcome).toEqual({ status: "success", message: "We sent you a new code.", resendAvailableAt });
    expect(readSignUpProgress(t.storage)).toEqual({ phone: "0901234567", resendAvailableAt });
  });

  it.each(["CODE_RESEND_TOO_SOON", "CODE_DAILY_LIMIT", "RATE_LIMITED"])(
    "turns a throttled answer (%s) into the wait text and a countdown",
    async (code) => {
      writeSignUpProgress(t.storage, { phone: "0901234567" });
      t.registration.sendCode.mockResolvedValue(fail(429, code, { retryAfterSeconds: 30 }));

      const outcome = await resendSignUpCode(t.deps);

      expect(outcome).toMatchObject({ status: "error", message: "Too many requests. Please wait 30 seconds and try again." });
      const at = "resendAvailableAt" in outcome ? outcome.resendAvailableAt : undefined;
      expect(Date.parse(at ?? "") - Date.now()).toBeGreaterThan(25_000);
    },
  );

  it("tells a number taken in the meantime in the alert", async () => {
    writeSignUpProgress(t.storage, { phone: "0901234567" });
    t.registration.sendCode.mockResolvedValue(fail(400, "VALIDATION_FAILED", { fieldErrors: TAKEN }));
    expect(await resendSignUpCode(t.deps)).toEqual({ status: "error", message: "Phone number is already in use." });
  });
});

describe("verifySignUpCode", () => {
  it("rejects a code that is not six digits", async () => {
    const outcome = await verifySignUpCode({ code: "12" }, t.deps);
    expect(outcome).toMatchObject({ fieldErrors: { code: ["Enter the 6-digit code."] } });
    expect(t.registration.verifyCode).not.toHaveBeenCalled();
  });

  it("goes back to the first step when there is no sign-up in progress", async () => {
    expect(await verifySignUpCode({ code: "123456" }, t.deps)).toEqual({ redirect: "/sign-up" });
    expect(t.registration.verifyCode).not.toHaveBeenCalled();
  });

  it("goes on to the details step when the number is already verified", async () => {
    writeSignUpProgress(t.storage, { phone: "0901234567", registrationToken: "t", tokenExpiresAt: inMinutes(10) });
    expect(await verifySignUpCode({ code: "123456" }, t.deps)).toEqual({ redirect: "/sign-up/details" });
    expect(t.registration.verifyCode).not.toHaveBeenCalled();
  });

  it("keeps the registration token in sessionStorage and moves to the details step", async () => {
    writeSignUpProgress(t.storage, { phone: "0901234567", resendAvailableAt: inMinutes(1) });
    const expiresAt = inMinutes(15);
    t.registration.verifyCode.mockResolvedValue(ok({ registrationToken: "token-1", expiresAt }));

    expect(await verifySignUpCode({ code: "123456" }, t.deps)).toEqual({ redirect: "/sign-up/details" });

    expect(t.registration.verifyCode).toHaveBeenCalledWith("0901234567", "123456");
    expect(readSignUpProgress(t.storage)).toEqual({
      phone: "0901234567",
      registrationToken: "token-1",
      tokenExpiresAt: expiresAt,
    });
  });

  it.each([
    ["CODE_INCORRECT", "Incorrect verification code."],
    ["CODE_EXPIRED", "The verification code is invalid or has expired. Please request a new one."],
    ["CODE_ATTEMPTS_EXCEEDED", "Too many incorrect codes. Please request a new one."],
  ])("shows the sign-up text for %s", async (code, text) => {
    writeSignUpProgress(t.storage, { phone: "0901234567" });
    t.registration.verifyCode.mockResolvedValue(fail(400, code));

    expect(await verifySignUpCode({ code: "123456" }, t.deps)).toEqual({ status: "error", message: text });
    expect(readSignUpProgress(t.storage)).toEqual({ phone: "0901234567" });
  });

  it("falls back to the generic wording for other failures", async () => {
    writeSignUpProgress(t.storage, { phone: "0901234567" });
    t.registration.verifyCode.mockResolvedValue(fail(429, "RATE_LIMITED", { retryAfterSeconds: 120 }));

    const outcome = await verifySignUpCode({ code: "123456" }, t.deps);

    expect(outcome).toMatchObject({ message: "Too many requests. Please wait 2 minutes and try again." });
  });
});

describe("completeSignUp", () => {
  const verified = () => ({ phone: "0901234567", registrationToken: "token-1", tokenExpiresAt: inMinutes(10) });
  const valid = { fullName: "Nguyen Van An", password: "Sunvibe@2026", confirmPassword: "Sunvibe@2026" };

  beforeEach(() => writeSignUpProgress(t.storage, verified()));

  it("sends a visitor who never started sign-up back to the first step", async () => {
    t.storage.clear();
    expect(await completeSignUp(valid, t.deps)).toEqual({ redirect: "/sign-up" });
    expect(t.api.register).not.toHaveBeenCalled();
  });

  it("sends a visitor whose phone is not verified yet to the code step", async () => {
    writeSignUpProgress(t.storage, { phone: "0901234567" });
    expect(await completeSignUp(valid, t.deps)).toEqual({ redirect: "/sign-up/verify" });
    expect(t.api.register).not.toHaveBeenCalled();
  });

  it("starts over when the registration token has expired", async () => {
    writeSignUpProgress(t.storage, { ...verified(), tokenExpiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(await completeSignUp(valid, t.deps)).toEqual({ redirect: "/sign-up?expired=1" });
    expect(t.api.register).not.toHaveBeenCalled();
  });

  it("refuses to send when cookies are blocked", async () => {
    t = setup({ cookiesEnabled: false });
    writeSignUpProgress(t.storage, verified());
    expect(await completeSignUp(valid, t.deps)).toMatchObject({ status: "error", message: COOKIE_TEXT });
    expect(t.api.register).not.toHaveBeenCalled();
  });

  it("never echoes passwords back", async () => {
    const outcome = await completeSignUp({ ...valid, confirmPassword: "Other@2026" }, t.deps);
    expect(outcome).toMatchObject({ fieldErrors: { confirmPassword: ["Passwords do not match."] } });
    expect("values" in outcome && outcome.values).toEqual({ fullName: "Nguyen Van An" });
    expect(t.api.register).not.toHaveBeenCalled();
  });

  it("takes the phone number and token from the progress, never from the form, and ends signed in", async () => {
    const forged = { ...valid, username: "0999999999", registrationToken: "forged" };

    const outcome = await completeSignUp(forged, t.deps);

    expect(outcome).toEqual({ redirect: "/account?phone=verified" });
    expect(t.api.register).toHaveBeenCalledWith({
      fullName: "Nguyen Van An",
      username: "0901234567",
      email: "",
      idCardNumber: "",
      password: "Sunvibe@2026",
      confirmPassword: "Sunvibe@2026",
      registrationToken: "token-1",
    });
    expect(t.store.adopt).toHaveBeenCalledWith(session(true), { newSignIn: true });
    expect(readSignUpProgress(t.storage)).toBeNull();
  });

  it("adopts the session in the same continuation as the register answer", async () => {
    let resolveRegister!: (value: PublicApiResult<SessionResponse>) => void;
    // The register answer itself, not wrapped: the flow's continuation is the first reaction registered on it.
    const answer = new Promise<PublicApiResult<SessionResponse>>((resolve) => {
      resolveRegister = resolve;
    });
    t.api.register.mockImplementation(() => answer);
    const pending = completeSignUp(valid, t.deps);
    await vi.waitFor(() => expect(t.api.register).toHaveBeenCalled());

    // Registered after the flow awaits the answer, so it runs right after the flow's continuation: any `await` between
    // the answer and `adopt` (where another tab's refresh could run) would let it run first.
    let adoptedBeforeNextReaction: boolean | undefined;
    const nextReaction = answer.then(() => {
      adoptedBeforeNextReaction = t.store.adopt.mock.calls.length > 0;
    });
    resolveRegister(ok(session(true), 201));
    // One microtask after the answer: the adopt must already have run.
    await Promise.resolve();
    await Promise.resolve();
    expect(t.store.adopt).toHaveBeenCalled();
    await nextReaction;
    expect(adoptedBeforeNextReaction).toBe(true);
    await pending;
  });

  it("falls back to phone verification if the backend did not mark the phone verified", async () => {
    t.api.register.mockResolvedValue(ok(session(false), 201));
    expect(await completeSignUp(valid, t.deps)).toEqual({ redirect: "/verify-phone" });
  });

  it("sends a pending logout before the register call", async () => {
    t = setup({ pendingLogout: true });
    writeSignUpProgress(t.storage, verified());
    await completeSignUp(valid, t.deps);
    expect(t.calls).toEqual(["logout", "register", "adopt"]);
  });

  it("keeps the pending logout when the submit sends nothing", async () => {
    t = setup({ pendingLogout: true });
    writeSignUpProgress(t.storage, verified());
    await completeSignUp({ ...valid, password: "" }, t.deps);
    expect(t.api.logout).not.toHaveBeenCalled();
    expect(t.jar.cookie).toContain(`${pendingCookieName()}=1`);
  });

  it("starts over when auth-service refuses the registration token", async () => {
    t.api.register.mockResolvedValue(fail(400, "REGISTRATION_TOKEN_INVALID"));

    expect(await completeSignUp(valid, t.deps)).toEqual({ redirect: "/sign-up?expired=1" });
    expect(readSignUpProgress(t.storage)).toBeNull();
    expect(t.store.adopt).not.toHaveBeenCalled();
  });

  it("tells in the alert when the phone number was taken in the meantime", async () => {
    t.api.register.mockResolvedValue(fail(400, "VALIDATION_FAILED", { fieldErrors: TAKEN }));
    const outcome = await completeSignUp(valid, t.deps);
    expect(outcome).toEqual({
      status: "error",
      message: "Phone number is already in use.",
      values: { fullName: "Nguyen Van An" },
    });
    expect(readSignUpProgress(t.storage)).not.toBeNull();
  });

  it("shows the generic text when the server cannot be reached and keeps the progress", async () => {
    t.api.register.mockResolvedValue({ ok: false, kind: "network" });
    expect(await completeSignUp(valid, t.deps)).toMatchObject({ status: "error", message: GENERIC });
    expect(readSignUpProgress(t.storage)).not.toBeNull();
  });

  it("shows the generic text when the call rejects and keeps the values and the progress", async () => {
    t.api.register.mockRejectedValue(new DOMException("blocked", "SecurityError"));
    expect(await completeSignUp(valid, t.deps)).toEqual({
      status: "error",
      message: GENERIC,
      values: { fullName: "Nguyen Van An" },
    });
    expect(readSignUpProgress(t.storage)).not.toBeNull();
    expect(t.store.adopt).not.toHaveBeenCalled();
  });

  it("shows the generic text when the session could not be adopted", async () => {
    t = setup({ adoptWorks: false });
    writeSignUpProgress(t.storage, verified());
    expect(await completeSignUp(valid, t.deps)).toMatchObject({ status: "error", message: GENERIC });
    expect(readSignUpProgress(t.storage)).toBeNull();
  });
});
