import type { Client } from "openapi-fetch";
import { describe, expect, it, vi } from "vitest";
import type { paths } from "@/api/generated/schema";
import type { ClientResponse } from "@/lib/api";
import type { ApiCall, ApiResult, CallApi } from "../session/api-client";
import type { MeResponse } from "./account-flow";
import {
  type CodeSentResponse,
  type VerifyPhoneDeps,
  confirmPhoneCode,
  loadVerifyPhone,
  sendPhoneCode,
} from "./verify-phone-flow";

const NOW = Date.parse("2026-10-18T10:00:00Z");
const GENERIC = "We couldn't reach the server. Please try again.";

type Sent = { method: "GET" | "POST"; path: string; body?: unknown };

/** A typed-client stand-in that records each request and answers with `respond`. */
function fakeClient(sent: Sent[], respond: () => ClientResponse<unknown>): Client<paths> {
  const record = (method: Sent["method"]) => async (path: string, init?: { body?: unknown }) => {
    sent.push({ method, path, ...(init?.body !== undefined && { body: init.body }) });
    return respond();
  };
  return { GET: record("GET"), POST: record("POST") } as unknown as Client<paths>;
}

function setup(
  result: ApiResult<unknown>,
  { runs = 1, generationAfterCall }: { runs?: number; generationAfterCall?: string | null } = {},
) {
  let generation: string | null = "gen-1";
  const sent: Sent[] = [];
  const response: ClientResponse<unknown> = { response: new Response(null, { status: 204 }) };
  const callApi = vi.fn();
  const fakeCallApi: CallApi = async <T,>(run: ApiCall<T>): Promise<ApiResult<T>> => {
    callApi();
    // callApi sends `run` again after a refresh; every attempt must build its own request.
    for (let attempt = 0; attempt < runs; attempt += 1) await run(fakeClient(sent, () => response));
    if (generationAfterCall !== undefined) generation = generationAfterCall;
    return result as ApiResult<T>;
  };
  const store = { updateUser: vi.fn(), markUnavailable: vi.fn(), generation: () => generation };
  const deps: VerifyPhoneDeps = { callApi: fakeCallApi, store, now: () => NOW };
  return { deps, sent, store, callApi };
}

function ok<T>(data: T, status = 200): ApiResult<T> {
  return { ok: true, data, status, replayed: false };
}

function http(status: number, code?: string, extra: { retryAfterSeconds?: number; field?: string } = {}): ApiResult<never> {
  return {
    ok: false,
    kind: "http",
    status,
    code,
    fieldErrors: extra.field ? [{ field: extra.field, message: "must be 6 digits" }] : [],
    retryAfterSeconds: extra.retryAfterSeconds,
  };
}

const me = (patch: Partial<MeResponse> = {}): MeResponse => ({
  fullName: "Nguyen Van A",
  username: "0901234567",
  email: null,
  emailVerified: false,
  phoneVerified: false,
  accountStatus: "PENDING",
  ...patch,
});

const codeSent: CodeSentResponse = {
  channel: "PHONE",
  sentTo: "*******567",
  expiresAt: "2026-10-18T10:05:00Z",
  resendAvailableAt: "2026-10-18T10:01:00Z",
};

describe("loadVerifyPhone", () => {
  it("verifyPhone_alreadyVerified_goesToAccount", async () => {
    const { deps, sent, store } = setup(ok(me({ phoneVerified: true })));
    expect(await loadVerifyPhone(deps)).toEqual({ redirect: "/account" });
    expect(sent).toEqual([{ method: "GET", path: "/api/v1/me" }]);
    // the session's user reads as verified too, like after ALREADY_VERIFIED
    expect(store.updateUser).toHaveBeenCalledWith({ phoneVerified: true });
  });

  it("loadVerifyPhone_alreadyVerified_sameSignIn_marksVerifiedAndRedirects", async () => {
    const { deps, store } = setup(ok(me({ phoneVerified: true })), { generationAfterCall: "gen-1" });
    expect(await loadVerifyPhone(deps)).toEqual({ redirect: "/account" });
    expect(store.updateUser).toHaveBeenCalledExactlyOnceWith({ phoneVerified: true });
  });

  it("loadVerifyPhone_alreadyVerified_otherSignInMeanwhile_touchesNothing", async () => {
    // A late /me of user A must not mark user B, who signed in meanwhile, as verified.
    for (const after of ["gen-2", null]) {
      const { deps, store } = setup(ok(me({ phoneVerified: true })), { generationAfterCall: after });
      expect(await loadVerifyPhone(deps)).toEqual({ kind: "session" });
      expect(store.updateUser).not.toHaveBeenCalled();
    }
  });

  it("loadVerifyPhone_notVerified_masksThePhone", async () => {
    const { deps } = setup(ok(me()));
    expect(await loadVerifyPhone(deps)).toEqual({ kind: "ready", maskedPhone: "•••••••567" });
  });

  it("loadVerifyPhone_404_marksTheSessionUnavailable", async () => {
    const { deps, store } = setup(http(404, "NOT_FOUND"));
    expect(await loadVerifyPhone(deps)).toEqual({ kind: "session" });
    expect(store.markUnavailable).toHaveBeenCalledOnce();
  });

  it("loadVerifyPhone_signedOut_leavesItToRequireSession", async () => {
    const { deps, store } = setup({ ok: false, kind: "signed-out" });
    expect(await loadVerifyPhone(deps)).toEqual({ kind: "session" });
    expect(store.markUnavailable).not.toHaveBeenCalled();
  });

  it("loadVerifyPhone_networkError_showsAnError", async () => {
    const { deps } = setup({ ok: false, kind: "network" });
    expect(await loadVerifyPhone(deps)).toEqual({ kind: "error" });
  });
});

describe("sendPhoneCode", () => {
  it("sendPhoneCode_success_saysWhereTheCodeWentAndWhenToResend", async () => {
    const { deps, sent } = setup(ok(codeSent));
    expect(await sendPhoneCode(deps)).toEqual({
      status: "success",
      message: "We sent a 6-digit code to *******567.",
      resendAvailableAt: "2026-10-18T10:01:00Z",
    });
    expect(sent).toEqual([{ method: "POST", path: "/api/v1/me/verification/phone/send-code" }]);
  });

  it.each(["CODE_RESEND_TOO_SOON", "CODE_DAILY_LIMIT", "RATE_LIMITED"])(
    "sendPhoneCode_429_setsTheResendTime (%s)",
    async (code) => {
      const { deps } = setup(http(429, code, { retryAfterSeconds: 60 }));
      expect(await sendPhoneCode(deps)).toEqual({
        status: "error",
        message: "Too many requests. Please wait 1 minute and try again.",
        resendAvailableAt: new Date(NOW + 60_000).toISOString(),
      });
    },
  );

  it("sendPhoneCode_429WithoutRetryAfter_setsNoResendTime", async () => {
    const { deps } = setup(http(429, "RATE_LIMITED"));
    expect(await sendPhoneCode(deps)).toEqual({
      status: "error",
      message: "Too many requests. Please wait a few minutes and try again.",
    });
  });

  it("sendPhoneCode_alreadyVerified_goesToAccount", async () => {
    const { deps, store } = setup(http(400, "ALREADY_VERIFIED"));
    expect(await sendPhoneCode(deps)).toEqual({ redirect: "/account" });
    expect(store.updateUser).toHaveBeenCalledWith({ phoneVerified: true });
  });

  it("sendPhoneCode_alreadyVerified_otherSignInMeanwhile_touchesNothing", async () => {
    // A late ALREADY_VERIFIED for user A must not mark user B, who signed in meanwhile, as verified.
    for (const after of ["gen-2", null]) {
      const { deps, store } = setup(http(400, "ALREADY_VERIFIED"), { generationAfterCall: after });
      expect(await sendPhoneCode(deps)).toEqual({ status: "idle" });
      expect(store.updateUser).not.toHaveBeenCalled();
    }
  });

  it("sendPhoneCode_signedOutOrUnavailable_showsNothing", async () => {
    for (const result of [{ ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as const) {
      const { deps } = setup(result);
      expect(await sendPhoneCode(deps)).toEqual({ status: "idle" });
    }
  });

  it("sendPhoneCode_serverError_showsTheGenericText", async () => {
    const { deps } = setup(http(500));
    expect(await sendPhoneCode(deps)).toEqual({ status: "error", message: GENERIC });
  });
});

describe("confirmPhoneCode", () => {
  it("confirmPhoneCode_success_updatesTheStoreAndRedirects", async () => {
    const { deps, store, sent } = setup(ok(undefined, 204));
    expect(await confirmPhoneCode({ code: " 123456 " }, deps)).toEqual({ redirect: "/account?phone=verified" });
    expect(store.updateUser).toHaveBeenCalledWith({ phoneVerified: true });
    expect(sent).toEqual([
      { method: "POST", path: "/api/v1/me/verification/phone/confirm-code", body: { code: "123456" } },
    ]);
  });

  it.each(["CODE_INCORRECT", "CODE_EXPIRED", "CODE_ATTEMPTS_EXCEEDED"])(
    "confirmPhoneCode_wrongCode_showsTheCodeText (%s)",
    async (code) => {
      const { deps, store } = setup(http(400, code));
      expect(await confirmPhoneCode({ code: "123456" }, deps)).toEqual({
        status: "error",
        message: "The code is incorrect or has expired.",
      });
      expect(store.updateUser).not.toHaveBeenCalled();
    },
  );

  it("confirmPhoneCode_malformedCode_sendsNothing", async () => {
    const { deps, callApi } = setup(ok(undefined, 204));
    const state = await confirmPhoneCode({ code: "12" }, deps);
    expect(state).toEqual({ status: "error", fieldErrors: { code: ["Enter the 6-digit code."] } });
    expect(callApi).not.toHaveBeenCalled();
  });

  it("confirmPhoneCode_fieldError_showsItUnderTheField", async () => {
    const { deps } = setup(http(400, "VALIDATION_FAILED", { field: "code" }));
    expect(await confirmPhoneCode({ code: "123456" }, deps)).toEqual({
      status: "error",
      fieldErrors: { code: ["must be 6 digits"] },
    });
  });

  it("confirmPhoneCode_alreadyVerified_goesToAccount", async () => {
    const { deps, store } = setup(http(400, "ALREADY_VERIFIED"));
    expect(await confirmPhoneCode({ code: "123456" }, deps)).toEqual({ redirect: "/account" });
    expect(store.updateUser).toHaveBeenCalledWith({ phoneVerified: true });
  });

  it("confirmPhoneCode_alreadyVerified_otherSignInMeanwhile_touchesNothing", async () => {
    for (const after of ["gen-2", null]) {
      const { deps, store } = setup(http(400, "ALREADY_VERIFIED"), { generationAfterCall: after });
      expect(await confirmPhoneCode({ code: "123456" }, deps)).toEqual({ status: "idle" });
      expect(store.updateUser).not.toHaveBeenCalled();
    }
  });

  it("confirmPhoneCode_signedOutOrUnavailable_noRedirectNoText", async () => {
    for (const result of [{ ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as const) {
      const { deps, store } = setup(result);
      expect(await confirmPhoneCode({ code: "123456" }, deps)).toEqual({ status: "idle" });
      expect(store.updateUser).not.toHaveBeenCalled();
    }
  });

  it("confirmPhoneCode_retriedAfterRefresh_sendsTheTypedCodeAgain", async () => {
    // W10-37 / E2E case 4: the call refused with 401 is sent again after the refresh, with the same code.
    const { deps, sent } = setup(ok(undefined, 204), { runs: 2 });
    await confirmPhoneCode({ code: "654321" }, deps);
    const confirm = { method: "POST", path: "/api/v1/me/verification/phone/confirm-code", body: { code: "654321" } };
    expect(sent).toEqual([confirm, confirm]);
  });

  it("confirmPhoneCode_networkError_showsTheGenericText", async () => {
    const { deps } = setup({ ok: false, kind: "network" });
    expect(await confirmPhoneCode({ code: "123456" }, deps)).toEqual({ status: "error", message: GENERIC });
  });
});
