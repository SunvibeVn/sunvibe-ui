import createClient, { type Client } from "openapi-fetch";

import type { paths } from "@/api/generated/schema";
import { publicEnv } from "@/config/public-env";
import {
  type ClientResponse,
  PUBLIC_API_TIMEOUT_MS,
  type PublicApiNetworkError,
  type PublicApiResult,
  toPublicResult,
  withTimeout,
} from "@/lib/api";

import { type SessionStore, sessionStore } from "./session-store";

// Signed-in calls to /api/v1/me/** and /api/v1/staff/** (auth-browser-session §4.3): a Bearer token from the
// session store and `credentials: "omit"`. A 401 refreshes once (shared by every call of the tab) and the call is
// sent once more with the new token. Only a refresh 401 ends the session (auth-browser-session BR-9): a second 401
// leaves the store unavailable, and 403, every other status and network errors never touch the session.

export type ApiSignedOut = { ok: false; kind: "signed-out" };
export type ApiUnavailable = { ok: false; kind: "unavailable"; retryAfterSeconds?: number };
export type ApiResult<T> = PublicApiResult<T> | ApiSignedOut | ApiUnavailable;

/**
 * One request through the typed client it is given. Run again after a refresh, so it builds the request each time.
 * A `run` that throws or rejects is reported as `{ ok: false, kind: "network" }`.
 */
export type ApiCall<T> = (client: Client<paths>) => Promise<ClientResponse<T>>;

export type ApiClientOptions = {
  store: SessionStore;
  baseUrl?: string;
  /** Injectable for tests. */
  fetch?: (request: Request) => Promise<Response>;
};

const SIGNED_OUT: ApiSignedOut = Object.freeze({ ok: false, kind: "signed-out" });
const UNAVAILABLE: ApiUnavailable = Object.freeze({ ok: false, kind: "unavailable" });
const NETWORK: PublicApiNetworkError = Object.freeze({ ok: false, kind: "network" });

/** Releases a 401 answer that is not read (openapi-fetch usually has read it already). Never throws. */
function discardBody(response: Response): void {
  try {
    if (!response.bodyUsed) response.body?.cancel().catch(() => undefined);
  } catch {
    // Nothing to release.
  }
}

export function createApiClient(options: ApiClientOptions) {
  const { store } = options;
  const baseUrl = options.baseUrl ?? publicEnv.apiUrl;
  const baseFetch = options.fetch ?? ((request: Request) => globalThis.fetch(request));

  const client = createClient<paths>({
    baseUrl,
    credentials: "omit",
    fetch: withTimeout(baseFetch, PUBLIC_API_TIMEOUT_MS),
  });

  // The Bearer goes only to the API itself: a per-request `baseUrl` of another origin gets no request at all.
  const apiOrigin = new URL(baseUrl).origin;

  // A client per attempt, bound to that attempt's token: concurrent calls never share a mutable "current token".
  // The header and `credentials` are set last, so a call cannot send another token or the cookies.
  const clientFor = (accessToken: string): Client<paths> =>
    createClient<paths>({
      baseUrl,
      credentials: "omit",
      fetch: withTimeout((request) => {
        // Rejected like a network error, so `callApi` answers `{ ok: false, kind: "network" }`.
        if (new URL(request.url).origin !== apiOrigin) {
          return Promise.reject(new TypeError("A signed-in call may only go to the API origin."));
        }
        const headers = new Headers(request.headers);
        headers.set("Authorization", `Bearer ${accessToken}`);
        return baseFetch(new Request(request, { headers, credentials: "omit" }));
      }, PUBLIC_API_TIMEOUT_MS),
    });

  const unavailable = (): ApiUnavailable => {
    const { retryAfterSeconds } = store.getSnapshot();
    return retryAfterSeconds === undefined ? UNAVAILABLE : { ok: false, kind: "unavailable", retryAfterSeconds };
  };

  /** No token: nobody is signed in, or the session cannot be reached now (no request is made in both cases). */
  const withoutToken = (): ApiSignedOut | ApiUnavailable =>
    store.getSnapshot().status === "unavailable" ? unavailable() : SIGNED_OUT;

  /** The raw answer, or null for a network error, a timeout or a throwing `run`. */
  async function send<T>(run: ApiCall<T>, accessToken: string): Promise<ClientResponse<T> | null> {
    try {
      return await run(clientFor(accessToken));
    } catch {
      return null;
    }
  }

  async function authorized<T>(run: ApiCall<T>): Promise<ApiResult<T>> {
    const token = await store.getAccessToken();
    // Read in the same continuation as the token: the sign-in this call belongs to.
    const signIn = store.generation();
    if (token === null) return withoutToken();
    // A call sent under one sign-in is never sent again, or allowed to change the session, under another one (for
    // example after another tab signed in as someone else and this tab was reset meanwhile).
    const sameSignIn = (): boolean => signIn !== null && store.generation() === signIn;

    const first = await send(run, token);
    if (first === null) return NETWORK;
    if (first.response.status !== 401) return toPublicResult(Promise.resolve(first));
    discardBody(first.response);

    const outcome = await store.forceRefresh(token);
    if (outcome === "ended") return SIGNED_OUT;
    if (outcome === "unavailable") return unavailable();
    if (!sameSignIn()) return SIGNED_OUT;
    const renewed = await store.getAccessToken();
    if (!sameSignIn()) return SIGNED_OUT;
    if (renewed === null) return withoutToken();
    const second = await send(run, renewed);
    if (second === null) return NETWORK;
    if (second.response.status !== 401) return toPublicResult(Promise.resolve(second));
    discardBody(second.response);

    // The new token is refused too: the page shows an error and nothing refreshes again on its own (not even a
    // token check, which could restore). Another sign-in that replaced this one meanwhile is left alone.
    if (!sameSignIn()) return SIGNED_OUT;
    store.markUnavailable();
    return UNAVAILABLE;
  }

  return {
    /**
     * Anonymous typed client: it never carries a token. Never use it for /api/v1/me/** or /api/v1/staff/**; every
     * signed-in call goes through `callApi`.
     */
    client,

    /**
     * Sends `run` with the tab's token and applies the 401 rule; never throws. A `run` that throws or rejects is
     * reported as `{ ok: false, kind: "network" }`.
     */
    async callApi<T>(run: ApiCall<T>): Promise<ApiResult<T>> {
      try {
        return await authorized(run);
      } catch {
        // A failing store method: the session is kept and the page offers a retry.
        return UNAVAILABLE;
      }
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

let defaultClient: ApiClient | undefined;
// Built on the first call, not at import: a missing or non-https API URL in a production build throws, and that
// must become a failed call, never break importing the module during server rendering.
const resolveDefault = (): ApiClient => (defaultClient ??= createApiClient({ store: sessionStore }));

/**
 * The tab's signed-in calls (auth-browser-session §4.3). Never throws: a configuration error and a `run` that throws
 * or rejects both answer `{ ok: false, kind: "network" }`.
 */
export async function callApi<T>(run: ApiCall<T>): Promise<ApiResult<T>> {
  let resolved: ApiClient;
  try {
    resolved = resolveDefault();
  } catch {
    return NETWORK;
  }
  return resolved.callApi(run);
}

/** The type of `callApi`, for flows that take it injected (tests pass a fake). */
export type CallApi = typeof callApi;

/** Safe to import anywhere. */
export const apiClient: ApiClient = {
  /**
   * Anonymous typed client: it never carries a token. Never use it for /api/v1/me/** or /api/v1/staff/**; use
   * `callApi`. Reading it resolves the API URL (and throws in a misconfigured production build).
   */
  get client() {
    return resolveDefault().client;
  },
  callApi,
};
