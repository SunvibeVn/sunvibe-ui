import { describe, expect, it, vi } from "vitest";
import type { ClientResponse } from "@/lib/api";
import type { ApiCall, ApiResult } from "../session/api-client";
import type { CallApi } from "../session/api-client";
import { type AccountDeps, type MeResponse, accountOverview, accountStatusLabel, readMe } from "./account-flow";

function setup(result: ApiResult<unknown>, { generationAfterCall }: { generationAfterCall?: string | null } = {}) {
  const paths: string[] = [];
  let generation: string | null = "gen-1";
  const callApi: CallApi = async <T,>(run: ApiCall<T>): Promise<ApiResult<T>> => {
    const client = {
      GET: async (path: string): Promise<ClientResponse<unknown>> => {
        paths.push(path);
        return { response: new Response(null, { status: 200 }) };
      },
    };
    await run(client as unknown as Parameters<ApiCall<T>>[0]);
    if (generationAfterCall !== undefined) generation = generationAfterCall;
    return result as ApiResult<T>;
  };
  const store = { markUnavailable: vi.fn(), generation: () => generation };
  const deps: AccountDeps = { callApi, store };
  return { deps, store, paths };
}

const profile: MeResponse = {
  fullName: "Nguyen Van A",
  username: "0901234567",
  email: "a@example.com",
  emailVerified: true,
  phoneVerified: true,
  accountStatus: "ACTIVE",
};

describe("readMe", () => {
  it("readMe_ok_returnsTheProfileFromGetMe", async () => {
    const { deps, paths } = setup({ ok: true, data: profile, status: 200, replayed: false });
    expect(await readMe(deps)).toEqual({ kind: "ready", me: profile });
    expect(paths).toEqual(["/api/v1/me"]);
  });

  it("readMe_404_marksTheSessionUnavailable", async () => {
    // auth-browser-session S-17: a missing account is an error, never a session end.
    const { deps, store } = setup({ ok: false, kind: "http", status: 404, code: "NOT_FOUND", fieldErrors: [] });
    expect(await readMe(deps)).toEqual({ kind: "session" });
    expect(store.markUnavailable).toHaveBeenCalledOnce();
  });

  it("readMe_stale404_newSignInMeanwhile_leavesTheNewSessionAlone", async () => {
    // A 404 for the account of an older sign-in must not mark the session that replaced it unavailable.
    for (const after of ["gen-2", null]) {
      const { deps, store } = setup(
        { ok: false, kind: "http", status: 404, code: "NOT_FOUND", fieldErrors: [] },
        { generationAfterCall: after },
      );
      expect(await readMe(deps)).toEqual({ kind: "session" });
      expect(store.markUnavailable).not.toHaveBeenCalled();
    }
  });

  it("readMe_signedOutOrUnavailable_leavesItToRequireSession", async () => {
    for (const result of [{ ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as const) {
      const { deps, store } = setup(result);
      expect(await readMe(deps)).toEqual({ kind: "session" });
      expect(store.markUnavailable).not.toHaveBeenCalled();
    }
  });

  it("readMe_networkOrServerError_showsAnError", async () => {
    const results: ApiResult<unknown>[] = [
      { ok: false, kind: "network" },
      { ok: false, kind: "http", status: 500, fieldErrors: [] },
      { ok: false, kind: "http", status: 403, fieldErrors: [] },
    ];
    for (const result of results) {
      const { deps, store } = setup(result);
      expect(await readMe(deps)).toEqual({ kind: "error" });
      expect(store.markUnavailable).not.toHaveBeenCalled();
    }
  });
});

describe("accountOverview (auth-email-access spec 6.2)", () => {
  const emailAccount: MeResponse = {
    fullName: "Nguyen Van A",
    username: null,
    email: "a@example.com",
    emailVerified: true,
    phoneVerified: false,
    requiredAction: null,
    accountStatus: "ACTIVE",
  };

  it("account_nullUsername_noPhoneRow", () => {
    expect(accountOverview(emailAccount).phone).toBeNull();
  });

  it("shows the phone row when the account has a number", () => {
    const view = accountOverview({ ...emailAccount, username: "0901234567", phoneVerified: true });
    expect(view.phone).toEqual({ value: "0901234567", verified: true });
  });

  it("account_bindPrompt_onlyForBindEmail", () => {
    expect(accountOverview({ ...emailAccount, requiredAction: "BIND_EMAIL" }).prompt).toBe("bind-email");
    expect(accountOverview({ ...emailAccount, requiredAction: "VERIFY_PHONE" }).prompt).toBe("verify-phone");
    expect(accountOverview(emailAccount).prompt).toBeNull();
    // A flag is not a gate: an email account owes no phone.
    expect(accountOverview({ ...emailAccount, phoneVerified: false, username: "0901234567" }).prompt).toBeNull();
  });

  it("gives the email row its badge and the change link", () => {
    expect(accountOverview(emailAccount).email).toEqual({ value: "a@example.com", verified: true, action: "Change email" });
  });

  it("an unverified stored email reads as not verified", () => {
    const view = accountOverview({ ...emailAccount, emailVerified: false });
    expect(view.email).toEqual({ value: "a@example.com", verified: false, action: "Change email" });
  });

  it("an account without an email is offered one", () => {
    const view = accountOverview({ ...emailAccount, email: null, emailVerified: false });
    expect(view.email).toEqual({ value: "Not provided", verified: undefined, action: "Add email" });
  });
});

describe("accountStatusLabel", () => {
  it("account_pendingLabel", () => {
    expect(accountStatusLabel("PENDING")).toBe("Pending verification");
  });

  it("accountStatusLabel_knownAndUnknownStatuses", () => {
    expect(accountStatusLabel("PENDING")).toBe("Pending verification");
    expect(accountStatusLabel("ACTIVE")).toBe("Active");
    expect(accountStatusLabel("SUSPENDED")).toBe("suspended");
    expect(accountStatusLabel(undefined)).toBe("");
  });
});
