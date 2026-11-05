import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicApiResult } from "@/lib/api";
import { LoginForm } from "../components/login-form";
import { type BrowserEnvironment, pendingCookieName } from "../session/browser-cookies";
import { settlePendingLogoutBeforeSignIn } from "../session/logout";
import type { SessionResponse } from "../session/session-api";
import type { RequiredAction, SessionSnapshot } from "../session/session-store";
import { type LoginDeps, submitLogin } from "./login-flow";
import { memoryStorage } from "./test-support/memory-storage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const COOKIE_TEXT =
  "Sunvibe needs cookies to keep you signed in. Turn on cookies for sunvibe.vn in your browser settings, then reload this page.";
const GENERIC = "We couldn't reach the server. Please try again.";

/** Minimal `document.cookie` model: the setter takes one cookie string, the getter returns `name=value` pairs. */
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

function session({
  requiredAction = null,
  phoneVerified = false,
}: { requiredAction?: RequiredAction | null; phoneVerified?: boolean } = {}): SessionResponse {
  return {
    accessToken: "access-token",
    expiresIn: 900,
    tokenType: "Bearer",
    user: {
      userId: "u-1",
      fullName: "An Nguyen",
      username: null,
      roles: ["TENANT"],
      phoneVerified,
      emailVerified: true,
      requiredAction,
    },
  } as SessionResponse;
}

const ok = (data: SessionResponse): PublicApiResult<SessionResponse> => ({ ok: true, data, status: 200, replayed: false });

type LoginResult = PublicApiResult<SessionResponse>;

function setup({
  answer = ok(session()),
  cookiesEnabled = true,
  pendingLogout = false,
  adoptWorks = true,
}: { answer?: LoginResult | Promise<LoginResult>; cookiesEnabled?: boolean; pendingLogout?: boolean; adoptWorks?: boolean } = {}) {
  const calls: string[] = [];
  const jar = new FakeJar(cookiesEnabled);
  if (pendingLogout) jar.cookie = `${pendingCookieName()}=1; Path=/`;
  const env: BrowserEnvironment = { navigator: { cookieEnabled: cookiesEnabled }, document: jar, sessionStorage: memoryStorage() };
  let snapshot: SessionSnapshot = { status: "signed-out", user: null };

  const api = {
    login: vi.fn((): Promise<LoginResult> => {
      calls.push("login");
      return Promise.resolve(answer);
    }),
    logout: vi.fn(async () => {
      calls.push("logout");
      return { ok: true, data: undefined, status: 204, replayed: false } as const;
    }),
  };
  const store = {
    adopt: vi.fn<LoginDeps["store"]["adopt"]>((response) => {
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
          requiredAction: user.requiredAction ?? null,
        },
      };
    }),
    getSnapshot: () => snapshot,
  };
  const deps: LoginDeps = {
    api: api as unknown as LoginDeps["api"],
    store,
    jar,
    env,
    settlePending: settlePendingLogoutBeforeSignIn,
  };
  return { api, store, jar, deps, calls };
}

const VALID = { email: "an@sunvibe.vn", password: "pw" };
const KEPT = { email: "an@sunvibe.vn" };

describe("submitLogin (W10-22, W10-43, W10-44)", () => {
  it("submitLogin_cookiesBlocked_sendsNothing", async () => {
    const { api, store, deps } = setup({ cookiesEnabled: false });
    expect(await submitLogin(VALID, deps)).toEqual({ status: "error", message: COOKIE_TEXT });
    expect(api.login).not.toHaveBeenCalled();
    expect(store.adopt).not.toHaveBeenCalled();
  });

  it("submitLogin_storageBlocked_sendsNothing", async () => {
    const { api, deps } = setup();
    const blocked: BrowserEnvironment = {
      ...deps.env,
      get sessionStorage(): Storage {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(await submitLogin(VALID, { ...deps, env: blocked })).toEqual({ status: "error", message: COOKIE_TEXT });
    expect(api.login).not.toHaveBeenCalled();
  });

  it("submitLogin_pendingLogout_settlesItFirst", async () => {
    const { calls, jar, deps } = setup({ pendingLogout: true });
    await submitLogin(VALID, deps);
    expect(calls.slice(0, 2)).toEqual(["logout", "login"]);
    expect(jar.cookie).not.toContain(pendingCookieName());
  });

  it("submitLogin_pendingLogoutInvalidForm_keepsTheFlag", async () => {
    const { api, jar, deps } = setup({ pendingLogout: true });
    await submitLogin({ email: "an", password: "" }, deps);
    expect(api.logout).not.toHaveBeenCalled();
    expect(api.login).not.toHaveBeenCalled();
    expect(jar.cookie).toContain(`${pendingCookieName()}=1`);
  });

  it("submitLogin_pendingLogoutCookiesBlocked_keepsTheFlag", async () => {
    const { api, jar, deps } = setup({ pendingLogout: true });
    const blocked: BrowserEnvironment = { ...deps.env, navigator: { cookieEnabled: false } };
    expect(await submitLogin(VALID, { ...deps, env: blocked })).toEqual({ status: "error", message: COOKIE_TEXT });
    expect(api.logout).not.toHaveBeenCalled();
    expect(api.login).not.toHaveBeenCalled();
    expect(jar.cookie).toContain(`${pendingCookieName()}=1`);
  });

  it("returns field errors without calling the backend (ported)", async () => {
    const { api, deps } = setup();
    const state = await submitLogin({ email: "an", password: "" }, deps);
    expect(state).toMatchObject({ status: "error", values: { email: "an" } });
    if ("redirect" in state) throw new Error("expected a form state");
    expect(state.fieldErrors?.email).toBeDefined();
    expect(state.fieldErrors?.password).toBeDefined();
    expect(api.login).not.toHaveBeenCalled();
  });

  it("adopts the new sign-in as a new sign-in (ported)", async () => {
    const response = session();
    const { store, deps } = setup({ answer: ok(response) });
    await submitLogin(VALID, deps);
    expect(store.adopt).toHaveBeenCalledWith(response, { newSignIn: true });
  });

  it("login_sendsEmailField", async () => {
    const { api, deps } = setup();
    await submitLogin({ email: "  An@Sunvibe.VN ", password: " pw " }, deps);
    expect(api.login).toHaveBeenCalledExactlyOnceWith({ email: "an@sunvibe.vn", password: " pw " });
  });

  it("login_null_keepsNext", async () => {
    const { deps } = setup();
    expect(await submitLogin({ ...VALID, next: "/account?tab=1" }, deps)).toEqual({ redirect: "/account?tab=1" });
  });

  it("login_bindEmail_goesToAccountEmail", async () => {
    const { deps } = setup({ answer: ok(session({ requiredAction: "BIND_EMAIL" })) });
    expect(await submitLogin({ ...VALID, next: "/account?tab=1" }, deps)).toEqual({ redirect: "/account/email" });
  });

  it("goes to /verify-phone when the server asks for it (ignores `next`)", async () => {
    const { deps } = setup({ answer: ok(session({ requiredAction: "VERIFY_PHONE" })) });
    expect(await submitLogin({ ...VALID, next: "//evil.com" }, deps)).toEqual({ redirect: "/verify-phone" });
    expect(await submitLogin({ ...VALID, next: "/account?tab=1" }, deps)).toEqual({ redirect: "/verify-phone" });
  });

  it("login_neverVerifyPhoneForEmailAccount", async () => {
    // A flag is not a gate: an email account has no verified phone, and only requiredAction decides.
    const { deps } = setup({ answer: ok(session({ phoneVerified: false, requiredAction: null })) });
    expect(await submitLogin(VALID, deps)).toEqual({ redirect: "/account" });
  });

  it("login_channelDisabled_message", async () => {
    const { deps } = setup({
      answer: { ok: false, kind: "http", status: 403, code: "AUTH_CHANNEL_DISABLED", fieldErrors: [] },
    });
    expect(await submitLogin(VALID, deps)).toEqual({
      status: "error",
      message: "This sign-in method isn't available.",
      values: KEPT,
    });
  });

  it("login_offersNoPhone", () => {
    const html = renderToStaticMarkup(createElement(LoginForm));
    expect(html).toContain('name="email"');
    expect(html).toContain('type="text"');
    expect(html).toContain('inputMode="email"');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('maxLength="320"');
    expect(html).toContain(">Email<");
    expect(html).not.toMatch(/phone/i);
    expect(html).not.toContain('type="tel"');
  });

  it("goes to the account page without `next`", async () => {
    const { deps } = setup();
    expect(await submitLogin(VALID, deps)).toEqual({ redirect: "/account" });
  });

  it("submitLogin_nextOutsideTheSite_goesToAccount (ported)", async () => {
    const { deps } = setup();
    for (const next of ["/.//evil.com", "//evil.com", "https://evil.com/x", "/\\evil.com"]) {
      expect(await submitLogin({ ...VALID, next }, deps)).toEqual({ redirect: "/account" });
    }
  });

  it("submitLogin_401_showsTheEmailText (keeps the address, adopts nothing)", async () => {
    const { store, deps } = setup({
      answer: { ok: false, kind: "http", status: 401, code: "INVALID_CREDENTIALS", fieldErrors: [] },
    });
    expect(await submitLogin({ ...VALID, password: "wrong" }, deps)).toEqual({
      status: "error",
      message: "Email or password is incorrect.",
      values: KEPT,
    });
    expect(store.adopt).not.toHaveBeenCalled();
  });

  it("submitLogin_locked_showsTheWait", async () => {
    const { deps } = setup({
      answer: { ok: false, kind: "http", status: 423, code: "ACCOUNT_LOCKED", fieldErrors: [], retryAfterSeconds: 300 },
    });
    expect(await submitLogin(VALID, deps)).toMatchObject({ message: "Too many failed attempts. Try again in 5 minutes." });
  });

  it("submitLogin_network_showsTheGenericText", async () => {
    const { deps } = setup({ answer: { ok: false, kind: "network" } });
    expect(await submitLogin(VALID, deps)).toEqual({ status: "error", message: GENERIC, values: KEPT });
  });

  // A rejecting call (missing API URL, a rejected Web Lock) is shown on the form, not as the route error page.
  it("submitLogin_rejectingApi_showsTheGenericTextAndKeepsTheValues", async () => {
    const { api, store, deps } = setup();
    api.login.mockRejectedValue(new Error("NEXT_PUBLIC_API_URL is missing"));
    expect(await submitLogin(VALID, deps)).toEqual({ status: "error", message: GENERIC, values: KEPT });
    expect(store.adopt).not.toHaveBeenCalled();
  });

  it("submitLogin_malformedResponse_showsTheGenericText", async () => {
    const { deps } = setup({ adoptWorks: false });
    expect(await submitLogin({ ...VALID, next: "/account" }, deps)).toEqual({
      status: "error",
      message: GENERIC,
      values: KEPT,
    });
  });

  it("never returns the password in the form state", async () => {
    const { deps } = setup({ answer: { ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [] } });
    expect(JSON.stringify(await submitLogin({ ...VALID, password: "s3cret" }, deps))).not.toContain("s3cret");
  });

  it("submitLogin_adoptsWithoutAwaitGap", async () => {
    let resolveLogin: (result: LoginResult) => void = () => {};
    const answer = new Promise<LoginResult>((resolve) => {
      resolveLogin = resolve;
    });
    const { api, calls, deps } = setup();
    // The login answer itself, not wrapped: the flow's continuation is the first reaction registered on it.
    api.login.mockImplementation(() => {
      calls.push("login");
      return answer;
    });
    const running = submitLogin(VALID, deps);
    await vi.waitFor(() => expect(api.login).toHaveBeenCalled());

    // Registered after the flow awaits the answer: it runs in the next microtask after the flow's continuation, so an
    // `await` between the answer and `adopt` (where another tab's refresh could run) would let it run first.
    void answer.then(() => calls.push("other task"));
    resolveLogin(ok(session()));
    await running;
    expect(calls.indexOf("adopt")).toBeGreaterThan(-1);
    expect(calls.indexOf("adopt")).toBeLessThan(calls.indexOf("other task"));
  });
});
