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
import { sendXhr, type UploadXhr, type XhrAnswer } from "./xhr-upload";

export type { UploadXhr } from "./xhr-upload";

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

/**
 * Per-call options. `timeoutMs` replaces the 15-second deadline of this call (each attempt gets the whole value), and
 * covers reading the body as well; image reads of survey photos use 60 and 300 seconds (survey-media PD-11, A-25).
 */
export type CallOptions = { timeoutMs?: number };

/** The answer an attempt gave once the 401 rule let it through. */
type TokenAnswer<R> = { kind: "answer"; answer: R };

/**
 * A body upload with the tab's token (survey-media PD-11: the photo content, which needs upload progress). `path` is a
 * path of the API (`/api/...`), never a URL: the request goes only to the API origin. `headers` may not carry
 * Authorization or Cookie; the token is set here and never handed to the caller.
 */
export type BearerUploadInput = {
  path: string;
  body: Blob;
  headers: Readonly<Record<string, string>>;
  onProgress?: (sent: number, total: number) => void;
  /** Aborts the upload (the row was cancelled, the page left). */
  signal?: AbortSignal;
  /** No progress for this long ends the upload as `network` (state unknown). */
  stallMs: number;
};
export type BearerUploadAborted = { ok: false; kind: "aborted" };
/** `network`: a network error, a stall or a refused connection; `signed-out` also after a sign-out mid-way. */
export type BearerUploadResult = ApiResult<unknown> | BearerUploadAborted;

export type ApiClientOptions = {
  store: SessionStore;
  baseUrl?: string;
  /** Injectable for tests. */
  fetch?: (request: Request) => Promise<Response>;
  /** Injectable for tests. */
  createXhr?: () => UploadXhr;
};

const SIGNED_OUT: ApiSignedOut = Object.freeze({ ok: false, kind: "signed-out" });
const UNAVAILABLE: ApiUnavailable = Object.freeze({ ok: false, kind: "unavailable" });
const NETWORK: PublicApiNetworkError = Object.freeze({ ok: false, kind: "network" });
const ABORTED: BearerUploadAborted = Object.freeze({ ok: false, kind: "aborted" });
/** Headers an upload caller may never set: the token is set by this client, and there are no cookies. */
const RESERVED_HEADERS = new Set(["authorization", "cookie"]);

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
  const createXhr = options.createXhr ?? ((): UploadXhr => new XMLHttpRequest());

  const client = createClient<paths>({
    baseUrl,
    credentials: "omit",
    fetch: withTimeout(baseFetch, PUBLIC_API_TIMEOUT_MS),
  });

  // The Bearer goes only to the API itself: a per-request `baseUrl` of another origin gets no request at all.
  const apiOrigin = new URL(baseUrl).origin;

  // A client per attempt, bound to that attempt's token: concurrent calls never share a mutable "current token".
  // The header and `credentials` are set last, so a call cannot send another token or the cookies.
  const clientFor = (accessToken: string, timeoutMs: number): Client<paths> =>
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
      }, timeoutMs),
    });

  const unavailable = (): ApiUnavailable => {
    const { retryAfterSeconds } = store.getSnapshot();
    return retryAfterSeconds === undefined ? UNAVAILABLE : { ok: false, kind: "unavailable", retryAfterSeconds };
  };

  /** No token: nobody is signed in, or the session cannot be reached now (no request is made in both cases). */
  const withoutToken = (): ApiSignedOut | ApiUnavailable =>
    store.getSnapshot().status === "unavailable" ? unavailable() : SIGNED_OUT;

  /** The raw answer, or null for a network error, a timeout or a throwing `run`. */
  async function send<T>(run: ApiCall<T>, accessToken: string, timeoutMs: number): Promise<ClientResponse<T> | null> {
    try {
      return await run(clientFor(accessToken, timeoutMs));
    } catch {
      return null;
    }
  }

  /**
   * The 401 rule around any attempt function: the tab's token, one refresh on a 401 (shared by every call of the tab)
   * and one more attempt with the new token; a second 401 leaves the store unavailable. Never sends an attempt under
   * another sign-in than the one it started with.
   */
  async function withAccessToken<R>(
    attempt: (accessToken: string) => Promise<R>,
    unauthorized: (answer: R) => boolean,
  ): Promise<TokenAnswer<R> | ApiSignedOut | ApiUnavailable> {
    const token = await store.getAccessToken();
    // Read in the same continuation as the token: the sign-in this call belongs to.
    const signIn = store.generation();
    if (token === null) return withoutToken();
    // A call sent under one sign-in is never sent again, or allowed to change the session, under another one (for
    // example after another tab signed in as someone else and this tab was reset meanwhile).
    const sameSignIn = (): boolean => signIn !== null && store.generation() === signIn;

    const first = await attempt(token);
    if (!unauthorized(first)) return { kind: "answer", answer: first };

    const outcome = await store.forceRefresh(token);
    if (outcome === "ended") return SIGNED_OUT;
    if (outcome === "unavailable") return unavailable();
    if (!sameSignIn()) return SIGNED_OUT;
    const renewed = await store.getAccessToken();
    if (!sameSignIn()) return SIGNED_OUT;
    if (renewed === null) return withoutToken();
    const second = await attempt(renewed);
    if (!unauthorized(second)) return { kind: "answer", answer: second };

    // The new token is refused too: the page shows an error and nothing refreshes again on its own (not even a
    // token check, which could restore). Another sign-in that replaced this one meanwhile is left alone.
    if (!sameSignIn()) return SIGNED_OUT;
    store.markUnavailable();
    return UNAVAILABLE;
  }

  async function authorized<T>(run: ApiCall<T>, timeoutMs: number): Promise<ApiResult<T>> {
    const isUnauthorized = (answer: ClientResponse<T> | null): boolean => {
      if (answer === null || answer.response.status !== 401) return false;
      discardBody(answer.response);
      return true;
    };
    const result = await withAccessToken((token) => send(run, token, timeoutMs), isUnauthorized);
    if (result.kind !== "answer") return result;
    return result.answer === null ? NETWORK : toPublicResult(Promise.resolve(result.answer));
  }

  /**
   * The upload of `BearerUploadInput` under the 401 rule of `callApi`. The request also stops when the sign-in it
   * started under ends (sign-out) or is replaced (another user); it then answers signed-out.
   */
  async function uploadWithBearer(input: BearerUploadInput): Promise<BearerUploadResult> {
    if (!input.path.startsWith("/") || input.path.startsWith("//")) return NETWORK;
    if (Object.keys(input.headers).some((name) => RESERVED_HEADERS.has(name.toLowerCase()))) return NETWORK;
    let url: string;
    try {
      const target = new URL(`${baseUrl.replace(/\/+$/, "")}${input.path}`);
      if (target.origin !== apiOrigin) return NETWORK;
      url = target.href;
    } catch {
      return NETWORK;
    }
    if (input.signal?.aborted) return ABORTED;

    const controller = new AbortController();
    /** The sign-in of the first attempt (read once the token is known). */
    let signIn: string | null = null;
    const unsubscribe = store.subscribe(() => {
      const ended = store.getSnapshot().status === "signed-out";
      if (ended || (signIn !== null && store.generation() !== signIn)) controller.abort();
    });
    const signals = input.signal === undefined ? [controller.signal] : [controller.signal, input.signal];
    try {
      const result = await withAccessToken(
        (token): Promise<XhrAnswer> => {
          signIn ??= store.generation();
          return sendXhr(createXhr, {
            method: "PUT",
            url,
            token,
            body: input.body,
            headers: input.headers,
            onProgress: input.onProgress,
            stallMs: input.stallMs,
            signals,
          });
        },
        (answer) => answer.kind === "answer" && answer.status === 401,
      );
      if (controller.signal.aborted) return SIGNED_OUT;
      if (result.kind !== "answer") return result;
      const answer = result.answer;
      if (answer.kind === "aborted") return ABORTED;
      if (answer.kind === "network") return NETWORK;
      const ok = answer.status >= 200 && answer.status < 300;
      return await toPublicResult(
        Promise.resolve({
          data: ok ? answer.body : undefined,
          error: ok ? undefined : answer.body,
          response: new Response(null, { status: answer.status, headers: answer.headers }),
        }),
      );
    } catch {
      return NETWORK;
    } finally {
      unsubscribe();
    }
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
    async callApi<T>(run: ApiCall<T>, options: CallOptions = {}): Promise<ApiResult<T>> {
      try {
        return await authorized(run, options.timeoutMs ?? PUBLIC_API_TIMEOUT_MS);
      } catch {
        // A failing store method: the session is kept and the page offers a retry.
        return UNAVAILABLE;
      }
    },

    /** A body upload with progress and the tab's token (`BearerUploadInput`); never throws. */
    uploadWithBearer,
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
export async function callApi<T>(run: ApiCall<T>, options?: CallOptions): Promise<ApiResult<T>> {
  let resolved: ApiClient;
  try {
    resolved = resolveDefault();
  } catch {
    return NETWORK;
  }
  return resolved.callApi(run, options);
}

/** The type of `callApi`, for flows that take it injected (tests pass a fake). */
export type CallApi = typeof callApi;

/** `uploadWithBearer` of the tab's client (see `ApiClient`). Never throws; a configuration error is `network`. */
export async function uploadWithBearer(input: BearerUploadInput): Promise<BearerUploadResult> {
  let resolved: ApiClient;
  try {
    resolved = resolveDefault();
  } catch {
    return NETWORK;
  }
  return resolved.uploadWithBearer(input);
}

/** The type of `uploadWithBearer`, for transports that take it injected (tests pass a fake). */
export type UploadWithBearer = typeof uploadWithBearer;

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
  uploadWithBearer,
};
