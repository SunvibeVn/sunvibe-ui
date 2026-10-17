import createClient from "openapi-fetch";

import type { components, paths } from "@/api/generated/schema";
import { publicEnv } from "@/config/public-env";
import { type ClientResponse, PUBLIC_API_TIMEOUT_MS, type PublicApiResult, toPublicResult } from "@/lib/api";

import { type CookieLockManager, withCookieLock } from "./cookie-lock";

// The calls that set, read or clear the HttpOnly refresh cookie (auth-browser-session §4.3): they send
// `credentials: "include"` and run under the browser-wide cookie lock. Bearer only on password change and
// logout-all. Every other call keeps `credentials: "omit"`.

export type SessionResponse = components["schemas"]["SessionResponse"];
export type LoginRequest = components["schemas"]["LoginRequest"];
export type RegisterRequest = components["schemas"]["UserRegisterRequest"];
export type PasswordResetCompleteRequest = components["schemas"]["PasswordResetRequest"];
export type PasswordChangeRequest = components["schemas"]["PasswordChangeRequest"];

/** The refresh answers fast or not at all; a page waits on it before showing private data. */
export const REFRESH_TIMEOUT_MS = 10_000;
export const SESSION_CALL_TIMEOUT_MS = PUBLIC_API_TIMEOUT_MS;

export type SessionApiOptions = {
  baseUrl?: string;
  /** Injectable for tests. */
  fetch?: (request: Request) => Promise<Response>;
  /** Injectable for tests; defaults to the browser's Web Locks, resolved at call time. */
  locks?: CookieLockManager;
};

function createCookieClient(baseUrl: string, baseFetch: (request: Request) => Promise<Response>) {
  return createClient<paths>({ baseUrl, credentials: "include", fetch: baseFetch });
}

/**
 * One call with a time limit on the whole answer, body included: on timeout the request is aborted and the call
 * answers as a network failure. A server that sends its headers and then stalls must not keep the cookie lock held.
 */
async function limited<T>(
  timeoutMs: number,
  call: (signal: AbortSignal) => Promise<ClientResponse<T>>,
): Promise<PublicApiResult<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<PublicApiResult<T>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, kind: "network" });
    }, timeoutMs);
  });
  try {
    return await Promise.race([toPublicResult(call(controller.signal)), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

export function createSessionApi(options: SessionApiOptions = {}) {
  const baseUrl = options.baseUrl ?? publicEnv.apiUrl;
  const baseFetch = options.fetch ?? ((request: Request) => globalThis.fetch(request));
  const client = createCookieClient(baseUrl, baseFetch);
  /** A cookie call with the limit of other session calls (the refresh has its own, shorter one). */
  const timed = <T>(call: (signal: AbortSignal) => Promise<ClientResponse<T>>) =>
    limited(SESSION_CALL_TIMEOUT_MS, call);
  const locked = <T>(task: () => Promise<T>): Promise<T> => withCookieLock<T>(task, options.locks);

  /**
   * The refresh without taking `sv-auth-cookie`. Only for a caller that already holds that lock (Web Locks are not
   * re-entrant), such as the in-grace retries that must run under the same lock.
   */
  const refreshUnlocked = () =>
    limited(REFRESH_TIMEOUT_MS, (signal) => client.POST("/api/v1/auth/session/refresh", { signal }));

  /**
   * The logout without taking `sv-auth-cookie`. Only for a caller that already holds that lock, such as the store
   * ending another account's session in the same lock hold that saw it (auth-browser-session S-25).
   * keepalive: the logout still reaches the API when the tab closes right after it.
   */
  const logoutUnlocked = () =>
    timed((signal) => client.POST("/api/v1/auth/session/logout", { keepalive: true, signal }));

  return {
    login: (body: LoginRequest) => locked(() => timed((signal) => client.POST("/api/v1/auth/login", { body, signal }))),
    register: (body: RegisterRequest) =>
      locked(() => timed((signal) => client.POST("/api/v1/auth/registration", { body, signal }))),
    refresh: () => locked(refreshUnlocked),
    refreshUnlocked,
    logout: () => locked(logoutUnlocked),
    logoutUnlocked,
    completePasswordReset: (body: PasswordResetCompleteRequest) =>
      locked(() => timed((signal) => client.POST("/api/v1/auth/password-reset/complete", { body, signal }))),
    changePassword: (accessToken: string, body: PasswordChangeRequest) =>
      locked(() =>
        timed((signal) =>
          client.POST("/api/v1/me/password/change", { body, headers: bearer(accessToken), signal }),
        ),
      ),
    logoutAll: (accessToken: string) =>
      locked(() =>
        timed((signal) => client.POST("/api/v1/me/sessions/logout-all", { headers: bearer(accessToken), signal })),
      ),
  };
}

export type SessionApi = ReturnType<typeof createSessionApi>;

let defaultApi: SessionApi | undefined;
// Built on first call, not at import: a missing or non-https API URL in a production build throws, and that must
// reject the call (a handled failure), never break importing the module during server rendering.
const resolveDefault = () => (defaultApi ??= createSessionApi());

/** Safe to import anywhere: the client and the API URL are resolved on the first call. */
export const sessionApi: SessionApi = {
  login: async (body) => resolveDefault().login(body),
  register: async (body) => resolveDefault().register(body),
  refresh: async () => resolveDefault().refresh(),
  refreshUnlocked: async () => resolveDefault().refreshUnlocked(),
  logout: async () => resolveDefault().logout(),
  logoutUnlocked: async () => resolveDefault().logoutUnlocked(),
  completePasswordReset: async (body) => resolveDefault().completePasswordReset(body),
  changePassword: async (accessToken, body) => resolveDefault().changePassword(accessToken, body),
  logoutAll: async (accessToken) => resolveDefault().logoutAll(accessToken),
};
