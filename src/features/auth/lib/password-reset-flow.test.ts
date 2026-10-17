import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldError, PublicApiHttpError, PublicApiResult } from "@/lib/api";
import type { BrowserEnvironment } from "../session/browser-cookies";
import {
  type PasswordResetApi,
  type PasswordResetDeps,
  type PasswordResetStartResponse,
  completeReset,
  requestResetByEmail,
  requestResetBySms,
} from "./password-reset-flow";
import { RESET_STORAGE_KEY, readResetProgress, saveResetToken } from "./reset-progress";
import { memoryStorage } from "./test-support/memory-storage";

const COOKIE_TEXT =
  "Sunvibe needs cookies to keep you signed in. Turn on cookies for sunvibe.vn in your browser settings, then reload this page.";
const GENERIC = "We couldn't reach the server. Please try again.";
const INVALID_LINK = "This reset link is invalid or has expired. Request a new one.";

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

const started = (resetToken?: string): PasswordResetStartResponse => ({
  otpExpirationMinutes: 5,
  ...(resetToken !== undefined && { resetToken }),
});

function setup({ cookiesEnabled = true }: { cookiesEnabled?: boolean } = {}) {
  const calls: string[] = [];
  const jar = new FakeJar(cookiesEnabled);
  const storage = memoryStorage();
  const env: BrowserEnvironment = { navigator: { cookieEnabled: cookiesEnabled }, document: jar, sessionStorage: storage };
  const reset = {
    byEmail: vi.fn<PasswordResetApi["byEmail"]>(async () => ok(started())),
    bySms: vi.fn<PasswordResetApi["bySms"]>(async () => ok(started("reset-1"))),
  };
  const api = {
    completePasswordReset: vi.fn<PasswordResetDeps["api"]["completePasswordReset"]>(async () => {
      calls.push("complete");
      return { ok: true, data: undefined, status: 204, replayed: false } as const;
    }),
  };
  const store = {
    endLocally: vi.fn<PasswordResetDeps["store"]["endLocally"]>(() => {
      calls.push(`end:${storage.getItem(RESET_STORAGE_KEY) === null ? "cleared" : "kept"}`);
    }),
  };
  const deps: PasswordResetDeps = { reset, api, store, env };
  return { reset, api, store, storage, deps, calls };
}

const fields = { otpCode: "123456", newPassword: "Sunvibe@2026", confirmPassword: "Sunvibe@2026" };

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
});

describe("requestResetByEmail", () => {
  it("answers the same way whether or not the account exists", async () => {
    const outcome = await requestResetByEmail({ email: "an@sunvibe.vn" }, t.deps);
    expect(outcome).toEqual({
      status: "success",
      message:
        "If an account uses this email, we've sent it a 6-digit code and a reset link. Open the link to choose a new password.",
      values: { email: "an@sunvibe.vn" },
    });
    expect(t.reset.byEmail).toHaveBeenCalledWith("an@sunvibe.vn");
  });

  it("requestResetByEmail_cookiesBlocked_sendsNothing", async () => {
    t = setup({ cookiesEnabled: false });
    const outcome = await requestResetByEmail({ email: "an@sunvibe.vn" }, t.deps);
    expect(outcome).toMatchObject({ status: "error", message: COOKIE_TEXT });
    expect(t.reset.byEmail).not.toHaveBeenCalled();
  });

  it("rejects a malformed e-mail without calling the backend", async () => {
    const outcome = await requestResetByEmail({ email: "not-an-email" }, t.deps);
    expect(outcome).toMatchObject({ status: "error", values: { email: "not-an-email" } });
    expect("fieldErrors" in outcome && outcome.fieldErrors?.email?.length).toBeTruthy();
    expect(t.reset.byEmail).not.toHaveBeenCalled();
  });

  it("explains a rate limit and a server failure by code", async () => {
    t.reset.byEmail.mockResolvedValueOnce(fail(429, "RATE_LIMITED", { retryAfterSeconds: 120 }));
    expect(await requestResetByEmail({ email: "an@sunvibe.vn" }, t.deps)).toMatchObject({
      status: "error",
      message: "Too many requests. Please wait 2 minutes and try again.",
    });
    t.reset.byEmail.mockResolvedValueOnce(fail(500, "INTERNAL_ERROR"));
    expect(await requestResetByEmail({ email: "an@sunvibe.vn" }, t.deps)).toMatchObject({ message: GENERIC });
  });
});

describe("requestResetBySms", () => {
  it("requestResetBySms_cookiesBlocked_sendsNothing", async () => {
    t = setup({ cookiesEnabled: false });
    const outcome = await requestResetBySms({ phoneNumber: "0901234567" }, t.deps);
    expect(outcome).toMatchObject({ status: "error", message: COOKIE_TEXT });
    expect(t.reset.bySms).not.toHaveBeenCalled();
    expect(t.storage.getItem(RESET_STORAGE_KEY)).toBeNull();
  });

  it("keeps the reset token in sessionStorage and moves to the reset page", async () => {
    const outcome = await requestResetBySms({ phoneNumber: "090 123 4567" }, t.deps);
    expect(outcome).toEqual({ redirect: "/reset-password?via=sms" });
    expect(t.reset.bySms).toHaveBeenCalledWith("0901234567");
    expect(readResetProgress(t.storage)).toMatchObject({ token: "reset-1", phone: "0901234567" });
  });

  it("keeps the real token when the same phone asks again within the backend's cooldown", async () => {
    // Inside the cooldown auth-service answers with a decoy token and sends no SMS.
    saveResetToken(t.storage, "real", "0901234567", Date.now() - 10_000);
    t.reset.bySms.mockResolvedValue(ok(started("decoy")));
    expect(await requestResetBySms({ phoneNumber: "090 123 4567" }, t.deps)).toEqual({
      redirect: "/reset-password?via=sms",
    });
    expect(readResetProgress(t.storage)?.token).toBe("real");
  });

  it("replaces the token after the cooldown or for another phone", async () => {
    t.reset.bySms.mockResolvedValue(ok(started("new")));

    saveResetToken(t.storage, "old", "0901234567", Date.now() - 61_000);
    await requestResetBySms({ phoneNumber: "0901234567" }, t.deps);
    expect(readResetProgress(t.storage)?.token).toBe("new");

    saveResetToken(t.storage, "old", "0907654321", Date.now());
    t.reset.bySms.mockResolvedValue(ok(started("newer")));
    await requestResetBySms({ phoneNumber: "0901234567" }, t.deps);
    expect(readResetProgress(t.storage)).toMatchObject({ token: "newer", phone: "0901234567" });
  });

  it("answers neutrally when the answer carries no token", async () => {
    t.reset.bySms.mockResolvedValue(ok(started()));
    expect(await requestResetBySms({ phoneNumber: "0901234567" }, t.deps)).toEqual({
      status: "success",
      message: "If an account uses this phone number, we've sent it a 6-digit code.",
      values: { phoneNumber: "0901234567" },
    });
    expect(t.storage.getItem(RESET_STORAGE_KEY)).toBeNull();
  });

  it("rejects a bad phone number without calling the backend", async () => {
    const outcome = await requestResetBySms({ phoneNumber: "12345" }, t.deps);
    expect(outcome).toMatchObject({ status: "error", values: { phoneNumber: "12345" } });
    expect("fieldErrors" in outcome && outcome.fieldErrors?.phoneNumber?.length).toBeTruthy();
    expect(t.reset.bySms).not.toHaveBeenCalled();
  });

  it("shows the server's field errors under the field and a network failure as generic", async () => {
    t.reset.bySms.mockResolvedValueOnce(
      fail(400, "VALIDATION_FAILED", { fieldErrors: [{ field: "phoneNumber", message: "Invalid phone." }] }),
    );
    expect(await requestResetBySms({ phoneNumber: "0901234567" }, t.deps)).toMatchObject({
      fieldErrors: { phoneNumber: ["Invalid phone."] },
    });
    t.reset.bySms.mockResolvedValueOnce({ ok: false, kind: "network" });
    expect(await requestResetBySms({ phoneNumber: "0901234567" }, t.deps)).toMatchObject({ message: GENERIC });
  });
});

describe("completeReset", () => {
  it("refuses when this tab holds no reset token", async () => {
    const outcome = await completeReset(fields, t.deps);
    expect(outcome).toEqual({ status: "error", message: INVALID_LINK });
    expect(t.api.completePasswordReset).not.toHaveBeenCalled();
  });

  it("refuses an expired reset token", async () => {
    saveResetToken(t.storage, "old", undefined, Date.now() - 15 * 60_000 - 1);
    expect(await completeReset(fields, t.deps)).toEqual({ status: "error", message: INVALID_LINK });
    expect(t.api.completePasswordReset).not.toHaveBeenCalled();
  });

  it("completeReset_success_signsEveryTabOut", async () => {
    saveResetToken(t.storage, "reset-sms", "0901234567", Date.now());
    const outcome = await completeReset(fields, t.deps);
    expect(outcome).toEqual({ redirect: "/login?reset=success" });
    expect(t.api.completePasswordReset).toHaveBeenCalledWith({ ...fields, resetToken: "reset-sms" });
    // Progress cleared first, then the local end (clears the hint, broadcasts signed-out to every tab).
    expect(t.calls).toEqual(["complete", "end:cleared"]);
    expect(t.store.endLocally).toHaveBeenCalledWith("signed-out");
  });

  it("uses the e-mail link token moved into storage", async () => {
    saveResetToken(t.storage, "reset-mail", undefined, Date.now());
    await completeReset(fields, t.deps);
    expect(t.api.completePasswordReset).toHaveBeenCalledWith({ ...fields, resetToken: "reset-mail" });
  });

  it("explains a wrong code", async () => {
    saveResetToken(t.storage, "t", undefined, Date.now());
    for (const code of ["CODE_INCORRECT", "CODE_ATTEMPTS_EXCEEDED"]) {
      t.api.completePasswordReset.mockResolvedValueOnce(fail(400, code));
      expect(await completeReset(fields, t.deps)).toEqual({
        status: "error",
        message: "The code is incorrect or has expired.",
      });
    }
    expect(t.store.endLocally).not.toHaveBeenCalled();
    expect(readResetProgress(t.storage)?.token).toBe("t");
  });

  it("completeReset_accountDisabled_showsTheOldText", async () => {
    saveResetToken(t.storage, "t", undefined, Date.now());
    t.api.completePasswordReset.mockResolvedValue(fail(401, "ACCOUNT_DISABLED"));
    expect(await completeReset(fields, t.deps)).toEqual({ status: "error", message: "Account is locked or disabled." });
    expect(t.store.endLocally).not.toHaveBeenCalled();
  });

  it("explains a used or expired reset token", async () => {
    saveResetToken(t.storage, "t", undefined, Date.now());
    t.api.completePasswordReset.mockResolvedValue(fail(400, "RESET_TOKEN_INVALID"));
    expect(await completeReset(fields, t.deps)).toEqual({ status: "error", message: INVALID_LINK });
    // C-7: a used or expired token is cleared at once; the session is not touched.
    expect(t.storage.getItem(RESET_STORAGE_KEY)).toBeNull();
    expect(t.store.endLocally).not.toHaveBeenCalled();
  });

  it("validates the fields before calling and never returns a password", async () => {
    saveResetToken(t.storage, "t", undefined, Date.now());
    const outcome = await completeReset({ otpCode: "12", newPassword: "weak", confirmPassword: "other" }, t.deps);
    expect(outcome).toMatchObject({ status: "error" });
    expect("fieldErrors" in outcome && Object.keys(outcome.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(["otpCode", "newPassword"]),
    );
    expect(JSON.stringify(outcome)).not.toContain("weak");
    expect(t.api.completePasswordReset).not.toHaveBeenCalled();
  });

  it("shows a rejecting call as generic and keeps the reset token", async () => {
    saveResetToken(t.storage, "t", undefined, Date.now());
    t.api.completePasswordReset.mockRejectedValue(new Error("NEXT_PUBLIC_API_URL is missing"));
    expect(await completeReset(fields, t.deps)).toEqual({ status: "error", message: GENERIC });
    expect(t.store.endLocally).not.toHaveBeenCalled();
    expect(readResetProgress(t.storage)).not.toBeNull();
  });

  it("shows a server failure as generic and keeps the session", async () => {
    saveResetToken(t.storage, "t", undefined, Date.now());
    t.api.completePasswordReset.mockResolvedValue({ ok: false, kind: "network" });
    expect(await completeReset(fields, t.deps)).toEqual({ status: "error", message: GENERIC });
    expect(t.store.endLocally).not.toHaveBeenCalled();
  });
});
