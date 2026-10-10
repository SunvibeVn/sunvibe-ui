# Auth Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign-up, phone verification, login, logout, forgot/reset password and an account page in `sunvibe-ui`, working end to end against `sunvibe-server`'s auth-service through a Next.js BFF.

**Architecture:** Browser → Next.js Server Actions → `sunvibe-server` (`:8082`). Next.js keeps the access and refresh tokens in its own HttpOnly cookies. `src/proxy.ts` refreshes the access token silently and does optimistic route redirects. Pages authorize through a Data Access Layer behind `<Suspense>`, because `cacheComponents` is on.

**Tech Stack:** Next.js 16.4 (App Router, `cacheComponents`), React 19.3, TypeScript 5, Tailwind CSS 4, zod 4.6, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-10-auth-feature-design.md`

## Global Constraints

- Backend base URL comes from `API_BASE_URL` (default `http://localhost:8082` outside production). It never gets a `NEXT_PUBLIC_` prefix.
- Endpoints, field names and rules exactly as spec §2:
  - `username` is the phone number, `^[0-9]{10,12}$`.
  - Password: 8–72 characters, at least one uppercase letter, one lowercase letter, one digit and one of `@$!%*?&`; only `[A-Za-z0-9@$!%*?&]` allowed.
  - OTP: `^\d{6}$`.
  - ID card: `^(|\d{9}|\d{12})$`.
  - Full name: 6–100 characters.
- Session cookies:
  - `sv_at` / `sv_rt`, prefixed `__Host-` in production.
  - HttpOnly, `SameSite=Lax`, `Path=/`, `Secure` in production.
  - Access `Max-Age = expiresIn − 30`; refresh `Max-Age` 604800.
- SMS reset token cookie: `sv_reset`, HttpOnly, `SameSite=Lax`, `Path=/reset-password`, `Max-Age` 900.
- The backend's refresh cookie is named `cookie-jwt-rf`.
- Every component that reads cookies or `searchParams` renders inside `<Suspense>`.
- Never log tokens, passwords or OTP codes.
- UI copy is English. Tailwind only; brand tokens are `navy-950/900/800` and `bg-brand-gradient` (in `src/app/globals.css`).
- Naming:
  - kebab-case files, PascalCase components;
  - suffixes `*.action.ts`, `*.service.ts`, `*.schema.ts`, `*.types.ts`, tests `*.test.ts`, colocated with the code;
  - relative imports inside `src/features/auth`;
  - other code imports `@/features/auth` (pages) or `@/features/auth/proxy` (proxy only).
- Every task ends with `npm test`, `npx tsc --noEmit` and `npm run lint` passing.
  - From Task 7 on, also `npm run build`.
  - `tsc` needs `.next/types`: if `LayoutProps`/`PageProps` are missing, run `npm run build` once first.

## Review Focus

1. **Stale session cookies after a server-side 401.** `/account` sends the user to `/login?session=expired`; the proxy must not bounce them back to `/account`, which would loop forever. Pinned in Task 5 (`guardRedirect` test).
2. **Access token expires while a page is open, then a form posts.** The Server Action POST passes through the proxy, which must refresh first. Pinned in Task 5 (`authProxy` POST test).
3. **Phone typed as `090 123 4567` or `+84901234567`.** It must be normalized to `0901234567`, not rejected or turned into a different account. Pinned in Task 3 (schema test).
4. **OTP pasted as `123 456` or `123-456`.** It must fill all six boxes. Pinned in Task 6 (`sanitizeOtp` test).
5. **Backend down.** Login shows a friendly error instead of crashing; a proxy refresh keeps the cookies instead of signing everyone out. Pinned in Task 4 (mapper test) and Task 5 (`refreshIfNeeded` "unavailable" test).

---

### Task 1: Test tooling, API client extensions, single backend URL

**Files:**
- Modify: `package.json` (deps + scripts)
- Create: `vitest.config.ts`
- Create: `src/lib/api/api-response.ts`
- Modify: `src/lib/api/api-error.ts`, `src/lib/api/http-client.ts`, `src/lib/api/index.ts`
- Create: `src/lib/api/http-client.test.ts`
- Modify: `src/config/env.ts`, `src/features/property/services/property.service.ts`, `.env.example`

**Interfaces:**
- Produces:
  - `ApiResponse<T> = { code: number; message?: string; result?: T }`
  - `unwrap<T>(response: ApiResponse<T>): T`
  - `ApiError` with `status`, `body`, `retryAfterSeconds?: number`, `fieldErrors: { field: string; message: string }[]`
  - `RequestOptions.cookie?: Record<string, string>`
  - `HttpClient.postRaw<T>(path, body?, options?): Promise<{ data: T; headers: Headers }>`
  - `serverEnv.apiBaseUrl: string`, `serverEnv.isProduction: boolean`

- [ ] **Step 1: Install dependencies and add scripts**

Run:
```bash
npm install zod@^4.6.5
npm install -D vitest@^5.0.3
```
In `package.json` `"scripts"`, add after `"lint"`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next.js resolves this marker package itself; outside Next its default export throws.
      "server-only": fileURLToPath(
        new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Write the failing test `src/lib/api/http-client.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-error";
import { unwrap } from "./api-response";
import { createHttpClient } from "./http-client";

function mockFetch(body: unknown, init: ResponseInit = {}) {
  const fetchMock = vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status: 200,
      ...init,
      headers: { "content-type": "application/json", ...(init.headers as Record<string, string>) },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const client = createHttpClient({ baseUrl: () => "http://api.test" });

afterEach(() => vi.unstubAllGlobals());

describe("createHttpClient", () => {
  it("sends JSON, bearer token, cookies and query string", async () => {
    const fetchMock = mockFetch({ code: 200, result: { ok: true } });

    await client.post("/api/things", { a: 1 }, {
      accessToken: "tok",
      cookie: { "cookie-jwt-rf": "r1" },
      query: { page: 2, empty: undefined },
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("http://api.test/api/things?page=2");
    const headers = new Headers(init.headers);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(headers.get("authorization")).toBe("Bearer tok");
    expect(headers.get("cookie")).toBe("cookie-jwt-rf=r1");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("exposes response headers through postRaw", async () => {
    mockFetch({ code: 200, result: {} }, { headers: { "x-trace": "abc" } });
    const { headers } = await client.postRaw("/api/login", {});
    expect(headers.get("x-trace")).toBe("abc");
  });

  it("turns a validation error into ApiError.fieldErrors", async () => {
    mockFetch(
      { message: "Validation failed", errors: [{ field: "username", message: "Taken" }] },
      { status: 406 },
    );
    const error = await client.post("/api/register", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(406);
    expect((error as ApiError).fieldErrors).toEqual([{ field: "username", message: "Taken" }]);
  });

  it("reads Retry-After into retryAfterSeconds", async () => {
    mockFetch({ code: 423, message: "Locked" }, { status: 423, headers: { "retry-after": "120" } });
    const error = (await client.post("/api/login", {}).catch((e: unknown) => e)) as ApiError;
    expect(error.message).toBe("Locked");
    expect(error.retryAfterSeconds).toBe(120);
  });
});

describe("unwrap", () => {
  it("returns the result of the envelope", () => {
    expect(unwrap({ code: 200, result: 5 })).toBe(5);
  });

  it("throws when the result is missing", () => {
    expect(() => unwrap({ code: 200, message: "x" })).toThrow();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- src/lib/api`
Expected: FAIL. `./api-response` cannot be resolved, and `postRaw` and the `cookie` option don't exist.

- [ ] **Step 5: Implement `src/lib/api/api-response.ts`**

```ts
/** Envelope every sunvibe-server endpoint answers with. */
export type ApiResponse<T> = {
  code: number;
  message?: string;
  result?: T;
};

export function unwrap<T>(response: ApiResponse<T>): T {
  if (response.result === undefined) {
    throw new Error(`API response has no result (${response.message ?? "no message"})`);
  }
  return response.result;
}
```

- [ ] **Step 6: Replace `src/lib/api/api-error.ts`**

```ts
export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
    /** Seconds from the `Retry-After` header (423 locked, 429 rate limited). */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Per-field messages of a validation error body: `{ errors: [{ field, message }] }`. */
  get fieldErrors(): FieldError[] {
    if (!this.body || typeof this.body !== "object" || !("errors" in this.body)) return [];
    const { errors } = this.body;
    if (!Array.isArray(errors)) return [];
    return errors.filter(
      (error): error is FieldError =>
        typeof error?.field === "string" && typeof error?.message === "string",
    );
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isNotFound() {
    return this.status === 404;
  }
}
```

- [ ] **Step 7: Replace `src/lib/api/http-client.ts`**

```ts
import { ApiError } from "./api-error";

type QueryValue = string | number | boolean | null | undefined;

export type RequestOptions = Omit<RequestInit, "method" | "body"> & {
  body?: unknown;
  query?: Record<string, QueryValue>;
  accessToken?: string;
  /** Sent as a `Cookie` header, for server-to-server calls that need a backend cookie. */
  cookie?: Record<string, string>;
};

type HttpClientConfig = {
  /** Resolved per request so a missing env var only fails the calls that need it. */
  baseUrl: () => string;
  defaultHeaders?: HeadersInit;
};

export type HttpClient = ReturnType<typeof createHttpClient>;

/**
 * Thin, typed wrapper over `fetch` for sunvibe-server. Caching is left to the
 * caller: pass `next`/`cache` options or wrap the call in `"use cache"`.
 */
export function createHttpClient({ baseUrl, defaultHeaders }: HttpClientConfig) {
  async function send<T>(
    method: string,
    path: string,
    { body, query, accessToken, cookie, headers, ...init }: RequestOptions = {},
  ): Promise<{ data: T; headers: Headers }> {
    const url = new URL(path.replace(/^\//, ""), withTrailingSlash(baseUrl()));
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const requestHeaders = new Headers(defaultHeaders);
    requestHeaders.set("Accept", "application/json");
    if (body !== undefined) requestHeaders.set("Content-Type", "application/json");
    if (accessToken) requestHeaders.set("Authorization", `Bearer ${accessToken}`);
    if (cookie) {
      requestHeaders.set(
        "Cookie",
        Object.entries(cookie)
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
      );
    }
    new Headers(headers).forEach((value, key) => requestHeaders.set(key, value));

    const response = await fetch(url, {
      ...init,
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await parseBody(response);
    if (!response.ok) {
      throw new ApiError(
        response.status,
        errorMessage(payload, response),
        payload,
        retryAfterSeconds(response),
      );
    }
    return { data: payload as T, headers: response.headers };
  }

  const request = async <T>(method: string, path: string, options?: RequestOptions) =>
    (await send<T>(method, path, options)).data;

  return {
    get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>("POST", path, { ...options, body }),
    put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>("PUT", path, { ...options, body }),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>("PATCH", path, { ...options, body }),
    delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, options),
    /** Like `post`, but also returns the response headers (e.g. `Set-Cookie`). */
    postRaw: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      send<T>("POST", path, { ...options, body }),
  };
}

function withTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  const isJson = response.headers.get("content-type")?.includes("application/json");
  return isJson ? JSON.parse(text) : text;
}

function errorMessage(payload: unknown, response: Response) {
  if (payload && typeof payload === "object" && "message" in payload) {
    return String(payload.message);
  }
  return `${response.status} ${response.statusText}`;
}

function retryAfterSeconds(response: Response) {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}
```

- [ ] **Step 8: Replace `src/lib/api/index.ts`**

```ts
export { ApiError } from "./api-error";
export type { FieldError } from "./api-error";
export { unwrap } from "./api-response";
export type { ApiResponse } from "./api-response";
export { createHttpClient } from "./http-client";
export type { HttpClient, RequestOptions } from "./http-client";
export type { Paginated, PaginationParams } from "./types";
```

- [ ] **Step 9: Run the tests**

Run: `npm test -- src/lib/api`
Expected: PASS (6 tests).

- [ ] **Step 10: Switch to a single backend URL**

Replace `src/config/env.ts`:
```ts
// Server-side settings. None has the NEXT_PUBLIC_ prefix, so Next.js never
// inlines them into browser bundles. No "server-only" import: src/proxy.ts
// reads this module, and proxy code doesn't run as a React Server Component.
const isProduction = process.env.NODE_ENV === "production";

export const serverEnv = {
  /** sunvibe-server is a modular monolith: every module answers on one base URL. */
  get apiBaseUrl() {
    const value = process.env.API_BASE_URL;
    if (value) return value;
    if (isProduction) throw new Error("Missing environment variable: API_BASE_URL");
    return "http://localhost:8082";
  },
  isProduction,
};
```

In `src/features/property/services/property.service.ts`:
- Replace `serverEnv.propertyServiceUrl` with `serverEnv.apiBaseUrl`.
- Replace the two paths `"/properties"` and `` `/properties/${encodeURIComponent(id)}` `` with `"/api/properties"` and `` `/api/properties/${encodeURIComponent(id)}` ``, matching the backend's `/api` prefix.
- Leave the "assumed REST contract" comment as it is.

Replace `.env.example`:
```bash
# Public URL of this site, used for absolute links in share previews (Open Graph).
NEXT_PUBLIC_SITE_URL=https://sunvibe.vn

# sunvibe-server base URL; every backend module answers on it.
# Server-side only: never prefix it with NEXT_PUBLIC_.
API_BASE_URL=http://localhost:8082
```

- [ ] **Step 11: Verify and commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass.
```bash
git add package.json package-lock.json vitest.config.ts src/lib/api src/config/env.ts src/features/property .env.example
git commit -m "feat(api): add test tooling, response envelope and single backend URL"
```

---

### Task 2: Auth constants and pure session helpers

**Files:**
- Create: `src/features/auth/constants.ts`
- Create: `src/features/auth/session/cookie-config.ts` + `cookie-config.test.ts`
- Create: `src/features/auth/session/backend-cookies.ts` + `backend-cookies.test.ts`
- Create: `src/features/auth/lib/safe-redirect.ts` + `safe-redirect.test.ts`
- Create: `src/features/auth/lib/forwarded-headers.ts` + `forwarded-headers.test.ts`

**Interfaces:**
- Produces:
  - `AUTH_ROUTES` (`login`, `signUp`, `forgotPassword`, `resetPassword`, `verifyPhone`, `account`)
  - `PROTECTED_PATHS`, `GUEST_ONLY_PATHS`
  - `BACKEND_REFRESH_COOKIE = "cookie-jwt-rf"`
  - `sessionCookieNames(production?) => { access, refresh }`, `RESET_TOKEN_COOKIE = "sv_reset"`
  - `accessCookieOptions(expiresIn, production?)`, `refreshCookieOptions(production?)`, `resetCookieOptions(production?)`, `expiredCookieOptions(options)`, all returning `CookieOptions`
  - `readSetCookie(setCookieHeaders: string[], name: string): string | undefined`
  - `safeRedirectPath(next: unknown, fallback: string): string`
  - `forwardedHeaders(source: Headers): Record<string, string>`

- [ ] **Step 1: Write the failing tests**

`src/features/auth/session/cookie-config.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  accessCookieOptions,
  expiredCookieOptions,
  refreshCookieOptions,
  resetCookieOptions,
  sessionCookieNames,
} from "./cookie-config";

describe("cookie-config", () => {
  it("prefixes names with __Host- in production only", () => {
    expect(sessionCookieNames(true)).toEqual({ access: "__Host-sv_at", refresh: "__Host-sv_rt" });
    expect(sessionCookieNames(false)).toEqual({ access: "sv_at", refresh: "sv_rt" });
  });

  it("expires the access cookie 30 seconds before the token", () => {
    expect(accessCookieOptions(900, true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 870,
    });
  });

  it("keeps the refresh cookie 7 days and scopes the reset cookie to its page", () => {
    expect(refreshCookieOptions(false)).toMatchObject({ secure: false, path: "/", maxAge: 604800 });
    expect(resetCookieOptions(false)).toMatchObject({ path: "/reset-password", maxAge: 900 });
  });

  it("builds deletion options with the same path and security flags", () => {
    expect(expiredCookieOptions(resetCookieOptions(true))).toMatchObject({
      path: "/reset-password",
      secure: true,
      maxAge: 0,
    });
  });
});
```

`src/features/auth/session/backend-cookies.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { readSetCookie } from "./backend-cookies";

const headers = [
  "cookie-jwt=access123; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Strict",
  "cookie-jwt-rf=refresh456; Path=/api/auth; Max-Age=604800; HttpOnly; Secure; SameSite=Strict",
];

describe("readSetCookie", () => {
  it("finds a cookie by exact name", () => {
    expect(readSetCookie(headers, "cookie-jwt-rf")).toBe("refresh456");
    expect(readSetCookie(headers, "cookie-jwt")).toBe("access123");
  });

  it("returns undefined for a missing or cleared cookie", () => {
    expect(readSetCookie(headers, "other")).toBeUndefined();
    expect(readSetCookie(["cookie-jwt-rf=; Path=/api/auth; Max-Age=0"], "cookie-jwt-rf")).toBeUndefined();
  });
});
```

`src/features/auth/lib/safe-redirect.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps same-site paths with query and hash", () => {
    expect(safeRedirectPath("/account?tab=1#top", "/")).toBe("/account?tab=1#top");
  });

  it.each([
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://evil.com"],
    ["/\t/evil.com"],
    ["account"],
    [""],
    [null],
    [42],
  ])("rejects %j", (next) => {
    expect(safeRedirectPath(next, "/account")).toBe("/account");
  });
});
```

`src/features/auth/lib/forwarded-headers.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { forwardedHeaders } from "./forwarded-headers";

describe("forwardedHeaders", () => {
  it("forwards the user agent and client IP", () => {
    const source = new Headers({ "user-agent": "Firefox", "x-forwarded-for": "203.0.113.7" });
    expect(forwardedHeaders(source)).toEqual({
      "User-Agent": "Firefox",
      "X-Forwarded-For": "203.0.113.7",
    });
  });

  it("falls back to x-real-ip and omits missing values", () => {
    expect(forwardedHeaders(new Headers({ "x-real-ip": "198.51.100.2" }))).toEqual({
      "X-Forwarded-For": "198.51.100.2",
    });
    expect(forwardedHeaders(new Headers())).toEqual({});
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/features/auth`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/features/auth/constants.ts`**

```ts
export const AUTH_ROUTES = {
  login: "/login",
  signUp: "/sign-up",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyPhone: "/verify-phone",
  account: "/account",
} as const;

/** Pages that need a session: the proxy sends visitors without one to the login page. */
export const PROTECTED_PATHS: readonly string[] = [AUTH_ROUTES.account, AUTH_ROUTES.verifyPhone];

/** Pages for visitors only: the proxy sends signed-in users to their account. */
export const GUEST_ONLY_PATHS: readonly string[] = [AUTH_ROUTES.login, AUTH_ROUTES.signUp];

/** Refresh-token cookie set by auth-service (`app.jwt.jwtRefreshCookieName`). */
export const BACKEND_REFRESH_COOKIE = "cookie-jwt-rf";

/** auth-service refresh-token idle lifetime (`app.jwt.jwtRefreshExpirationMs`). */
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** The access cookie expires this long before the token, so the proxy refreshes in time. */
export const ACCESS_TOKEN_EXPIRY_SKEW_SECONDS = 30;

export const RESET_TOKEN_MAX_AGE_SECONDS = 15 * 60;
```

- [ ] **Step 4: Implement `src/features/auth/session/cookie-config.ts`**

```ts
import {
  ACCESS_TOKEN_EXPIRY_SKEW_SECONDS,
  AUTH_ROUTES,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  RESET_TOKEN_MAX_AGE_SECONDS,
} from "../constants";

export type CookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
};

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * `__Host-` makes browsers require Secure and Path=/ and refuse a Domain
 * attribute, so no subdomain can plant or overwrite the session cookies.
 * Plain HTTP on localhost can't use it, hence production only.
 */
export function sessionCookieNames(production = isProduction()) {
  const prefix = production ? "__Host-" : "";
  return { access: `${prefix}sv_at`, refresh: `${prefix}sv_rt` };
}

/** Holds the SMS reset token between /forgot-password and /reset-password. */
export const RESET_TOKEN_COOKIE = "sv_reset";

export function accessCookieOptions(expiresInSeconds: number, production = isProduction()) {
  return options(production, "/", Math.max(0, expiresInSeconds - ACCESS_TOKEN_EXPIRY_SKEW_SECONDS));
}

export function refreshCookieOptions(production = isProduction()) {
  return options(production, "/", REFRESH_TOKEN_MAX_AGE_SECONDS);
}

export function resetCookieOptions(production = isProduction()) {
  return options(production, AUTH_ROUTES.resetPassword, RESET_TOKEN_MAX_AGE_SECONDS);
}

/** Deleting a cookie needs the same path and Secure flag it was set with. */
export function expiredCookieOptions(cookie: CookieOptions): CookieOptions {
  return { ...cookie, maxAge: 0 };
}

function options(secure: boolean, path: string, maxAge: number): CookieOptions {
  return { httpOnly: true, secure, sameSite: "lax", path, maxAge };
}
```

- [ ] **Step 5: Implement `src/features/auth/session/backend-cookies.ts`**

```ts
/** Value of cookie `name` among a response's Set-Cookie headers; undefined if absent or cleared. */
export function readSetCookie(setCookieHeaders: string[], name: string): string | undefined {
  for (const header of setCookieHeaders) {
    const pair = header.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator === -1 || pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    return value === "" ? undefined : value;
  }
  return undefined;
}
```

- [ ] **Step 6: Implement `src/features/auth/lib/safe-redirect.ts`**

```ts
const PLACEHOLDER_ORIGIN = "http://localhost";

/**
 * `next` when it is a path on this site, otherwise `fallback`. Blocks open
 * redirects such as `//evil.com`, `/\evil.com` and absolute URLs.
 */
export function safeRedirectPath(next: unknown, fallback: string): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  try {
    // The URL parser strips tabs/newlines, so "/\t/evil.com" becomes "//evil.com".
    const url = new URL(next, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 7: Implement `src/features/auth/lib/forwarded-headers.ts`**

```ts
/**
 * Headers that tell auth-service who the real client is. Behind the BFF every
 * request comes from the Next.js server, so without these the backend's rate
 * limits, lockouts and audit log would treat all users as one (spec §8).
 */
export function forwardedHeaders(source: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  const userAgent = source.get("user-agent");
  if (userAgent) result["User-Agent"] = userAgent;
  const clientIp = source.get("x-forwarded-for") ?? source.get("x-real-ip");
  if (clientIp) result["X-Forwarded-For"] = clientIp;
  return result;
}
```

- [ ] **Step 8: Run the tests**

Run: `npm test -- src/features/auth`
Expected: PASS.

- [ ] **Step 9: Verify and commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
```bash
git add src/features/auth/constants.ts src/features/auth/session src/features/auth/lib
git commit -m "feat(auth): add route constants and session cookie helpers"
```

---

### Task 3: Auth types, zod schemas and the auth-service client

**Files:**
- Modify (replace): `src/features/auth/types/auth.types.ts`
- Create: `src/features/auth/schemas/auth.schema.ts` + `auth.schema.test.ts`
- Create: `src/features/auth/services/auth-api.ts`
- Modify (replace): `src/features/auth/services/auth.service.ts`
- Create: `src/features/auth/services/auth.service.test.ts`
- Modify (replace): `src/features/auth/index.ts`

**Interfaces:**
- Consumes: `createHttpClient`, `unwrap`, `ApiResponse` (Task 1); `readSetCookie`, `BACKEND_REFRESH_COOKIE` (Task 2); `serverEnv.apiBaseUrl` (Task 1).
- Produces:
  - Types `AuthTokenResponse`, `AuthSession { accessToken; refreshToken; expiresIn; phoneVerified }`, `UserProfile`, `VerificationSendResult`, `PasswordForgotResult`.
  - Schemas `loginSchema`, `registerSchema`, `otpSchema`, `forgotByEmailSchema`, `forgotBySmsSchema`, `resetPasswordFieldsSchema`, `resetPasswordSchema`, plus `PASSWORD_RULES`, `normalizePhone`.
  - Input types `LoginInput`, `RegisterInput`, `ResetPasswordInput`.
  - `authApi` (HttpClient), `toAuthSession(call)`, `refreshSession(refreshToken, headers)`.
  - `authService.{login, register, logout, getProfile, sendPhoneCode, confirmPhone, forgotPasswordByEmail, forgotPasswordBySms, resetPassword}`.
  - `CallContext = { accessToken?: string; headers?: Record<string, string> }`.

- [ ] **Step 1: Write the failing schema test `src/features/auth/schemas/auth.schema.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  forgotByEmailSchema,
  loginSchema,
  normalizePhone,
  otpSchema,
  registerSchema,
  resetPasswordSchema,
} from "./auth.schema";

const validRegistration = {
  fullName: "Nguyen Van An",
  username: "0901234567",
  email: "",
  idCardNumber: "",
  password: "Sunvibe@2026",
  confirmPassword: "Sunvibe@2026",
};

describe("normalizePhone", () => {
  it.each([
    ["090 123 4567", "0901234567"],
    ["090.123.4567", "0901234567"],
    ["(090) 123-4567", "0901234567"],
    ["+84901234567", "0901234567"],
    ["+84 90 123 4567", "0901234567"],
  ])("normalizes %j", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe("loginSchema", () => {
  it("accepts a formatted phone and returns digits only", () => {
    const result = loginSchema.safeParse({ username: "+84 90 123 4567", password: "x" });
    expect(result.success && result.data.username).toBe("0901234567");
  });

  it("rejects a too-short phone and an empty password", () => {
    const result = loginSchema.safeParse({ username: "12345", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("accepts a valid registration with optional fields empty", () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true);
  });

  it.each([
    ["short", "Ab1@"],
    ["no uppercase", "sunvibe@2026"],
    ["no lowercase", "SUNVIBE@2026"],
    ["no digit", "Sunvibe@abcd"],
    ["no special", "Sunvibe2026"],
    ["disallowed char", "Sunvibe@2026#"],
    ["too long", `Aa1@${"a".repeat(69)}`],
  ])("rejects a password that is %s", (_label, password) => {
    const result = registerSchema.safeParse({ ...validRegistration, password, confirmPassword: password });
    expect(result.success).toBe(false);
  });

  it("reports mismatched passwords on confirmPassword", () => {
    const result = registerSchema.safeParse({ ...validRegistration, confirmPassword: "Other@2026" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === "confirmPassword")).toBe(true);
  });

  it("validates the optional e-mail and ID card when provided", () => {
    expect(registerSchema.safeParse({ ...validRegistration, email: "not-an-email" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegistration, idCardNumber: "12345" }).success).toBe(false);
    expect(
      registerSchema.safeParse({ ...validRegistration, email: "an@sunvibe.vn", idCardNumber: "012345678901" }).success,
    ).toBe(true);
  });

  it("rejects a full name shorter than 6 characters", () => {
    expect(registerSchema.safeParse({ ...validRegistration, fullName: "An" }).success).toBe(false);
  });
});

describe("otp, forgot and reset schemas", () => {
  it("accepts exactly six digits", () => {
    expect(otpSchema.safeParse({ code: "123456" }).success).toBe(true);
    expect(otpSchema.safeParse({ code: "12345" }).success).toBe(false);
  });

  it("requires a valid e-mail to request a reset", () => {
    expect(forgotByEmailSchema.safeParse({ email: "an@sunvibe.vn" }).success).toBe(true);
    expect(forgotByEmailSchema.safeParse({ email: "" }).success).toBe(false);
  });

  it("requires token, code and matching strong passwords to reset", () => {
    const base = { resetToken: "t", otpCode: "123456", newPassword: "Sunvibe@2026", confirmPassword: "Sunvibe@2026" };
    expect(resetPasswordSchema.safeParse(base).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ ...base, resetToken: "" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...base, confirmPassword: "x" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/features/auth/schemas`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/features/auth/schemas/auth.schema.ts`**

```ts
import { z } from "zod";

// Mirrors auth-service validation: LoginRequest, UserRegisterRequest,
// StrongPasswordValidator, VerificationConfirmRequest, PasswordResetRequest.

export type PasswordRule = { id: string; label: string; test: (value: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: "8 to 72 characters", test: (v) => v.length >= 8 && v.length <= 72 },
  { id: "upper", label: "An uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "lower", label: "A lowercase letter", test: (v) => /[a-z]/.test(v) },
  { id: "digit", label: "A number", test: (v) => /\d/.test(v) },
  { id: "special", label: "One of @ $ ! % * ? &", test: (v) => /[@$!%*?&]/.test(v) },
];

const PASSWORD_CHARSET = /^[A-Za-z\d@$!%*?&]+$/;

/** "090 123 4567", "090.123.4567" or "+84 90 123 4567" → "0901234567". */
export function normalizePhone(value: string): string {
  return value.replace(/[\s.\-()]/g, "").replace(/^\+84/, "0");
}

const phone = z
  .string()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^[0-9]{10,12}$/, "Enter a phone number of 10 to 12 digits."));

const otpCode = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.");

const strongPassword = z
  .string()
  .refine((value) => PASSWORD_RULES.every((rule) => rule.test(value)), {
    message: "Use 8–72 characters with uppercase, lowercase, a number and one of @$!%*?&.",
  })
  .refine((value) => value === "" || PASSWORD_CHARSET.test(value), {
    message: "Use only letters, numbers and @$!%*?&.",
  });

const email = z.string().trim().pipe(z.email("Enter a valid email address."));

const optionalEmail = z
  .string()
  .trim()
  .max(100, "Use at most 100 characters.")
  .refine((value) => value === "" || z.email().safeParse(value).success, {
    message: "Enter a valid email address.",
  });

const passwordsMatch = { path: ["confirmPassword"], message: "Passwords do not match." };

export const loginSchema = z.object({
  username: phone,
  password: z.string().min(1, "Enter your password."),
});

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(6, "Full name must be 6 to 100 characters.")
      .max(100, "Full name must be 6 to 100 characters."),
    username: phone,
    email: optionalEmail,
    idCardNumber: z
      .string()
      .trim()
      .regex(/^(|\d{9}|\d{12})$/, "Enter a 9-digit CMND or 12-digit CCCD number."),
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, passwordsMatch);

export const otpSchema = z.object({ code: otpCode });

export const forgotByEmailSchema = z.object({ email });

export const forgotBySmsSchema = z.object({ phoneNumber: phone });

/** Reset fields without the cross-field check: zod 4 can't `.omit()` a refined object. */
export const resetPasswordFieldsSchema = z.object({
  resetToken: z.string().min(1, "This reset link is invalid or has expired."),
  otpCode,
  newPassword: strongPassword,
  confirmPassword: z.string(),
});

export const resetPasswordSchema = resetPasswordFieldsSchema.refine(
  (data) => data.newPassword === data.confirmPassword,
  passwordsMatch,
);

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

- [ ] **Step 4: Run the schema tests**

Run: `npm test -- src/features/auth/schemas`
Expected: PASS.

- [ ] **Step 5: Replace `src/features/auth/types/auth.types.ts`**

```ts
/** Body of login, register and refresh responses (`LoginResponse` in auth-service). */
export type AuthTokenResponse = {
  tokenType: string;
  accessToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  username: string;
  userEmail: string | null;
  roles: string[];
  phoneVerified: boolean;
  emailVerified: boolean;
  message: string;
};

/** A token pair: the access token from the body, the refresh token from Set-Cookie. */
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  phoneVerified: boolean;
};

/** Body of `GET /api/user/query/my-info` (`UserProfileInfo`). */
export type UserProfile = {
  fullName: string;
  /** The phone number. */
  username: string;
  email: string | null;
  profileImageUrl: string | null;
  kycStatus: string;
  accountStatus: string;
  phoneVerified: boolean;
  emailVerified: boolean;
};

/** A verification code was sent (`VerificationSendResponse`). */
export type VerificationSendResult = {
  channel: "PHONE" | "EMAIL";
  /** Partly hidden phone or e-mail. */
  sentTo: string;
  expiresAt: string;
  resendAvailableAt: string;
};

/** `PasswordForgotResponse`; `resetToken` is only present in the SMS flow. */
export type PasswordForgotResult = {
  message: string;
  resetToken?: string;
  expiresAt?: string;
  otpExpirationMinutes: number;
};
```

- [ ] **Step 6: Write the failing service test `src/features/auth/services/auth.service.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authService } from "./auth.service";

const tokenBody = {
  code: 200,
  result: {
    tokenType: "Bearer",
    accessToken: "access-1",
    expiresIn: 900,
    username: "0901234567",
    userEmail: null,
    roles: ["ROLE_CLIENT"],
    phoneVerified: false,
    emailVerified: false,
    message: "ok",
  },
};

function respond(body: unknown, setCookies: string[] = [], status = 200) {
  const headers = new Headers({ "content-type": "application/json" });
  for (const cookie of setCookies) headers.append("set-cookie", cookie);
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => vi.stubEnv("API_BASE_URL", "http://api.test"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("authService.login", () => {
  it("returns the access token from the body and the refresh token from Set-Cookie", async () => {
    const fetchMock = respond(tokenBody, ["cookie-jwt=access-1; Path=/", "cookie-jwt-rf=refresh-1; Path=/api/auth"]);

    const session = await authService.login(
      { username: "0901234567", password: "pw" },
      { headers: { "X-Forwarded-For": "203.0.113.7" } },
    );

    expect(session).toEqual({ accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 900, phoneVerified: false });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("http://api.test/api/auth/login");
    expect(new Headers(init.headers).get("x-forwarded-for")).toBe("203.0.113.7");
    expect(init.cache).toBe("no-store");
  });

  it("fails loudly when the refresh cookie is missing", async () => {
    respond(tokenBody, ["cookie-jwt=access-1; Path=/"]);
    await expect(authService.login({ username: "0901234567", password: "pw" })).rejects.toThrow(/refresh/);
  });
});

describe("authService authenticated calls", () => {
  it("unwraps the profile and sends the bearer token", async () => {
    const fetchMock = respond({ code: 200, result: { fullName: "An", username: "0901234567" } });
    const profile = await authService.getProfile("access-1");
    expect(profile.fullName).toBe("An");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("http://api.test/api/user/query/my-info");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-1");
  });

  it("sends the refresh token as the backend cookie on logout", async () => {
    const fetchMock = respond({ code: 200, message: "bye" });
    await authService.logout("refresh-1");
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(new Headers(init.headers).get("cookie")).toBe("cookie-jwt-rf=refresh-1");
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test -- src/features/auth/services`
Expected: FAIL. `authService.login` takes the old argument shape and returns no session.

- [ ] **Step 8: Implement `src/features/auth/services/auth-api.ts`**

```ts
import { serverEnv } from "@/config/env";
import { createHttpClient, unwrap, type ApiResponse } from "@/lib/api";
import { BACKEND_REFRESH_COOKIE } from "../constants";
import { readSetCookie } from "../session/backend-cookies";
import type { AuthSession, AuthTokenResponse } from "../types/auth.types";

// Shared by auth.service.ts (Server Actions, pages) and session/refresh.ts
// (proxy). No "server-only" import here because proxy code can't use it.
export const authApi = createHttpClient({ baseUrl: () => serverEnv.apiBaseUrl });

type TokenCall = () => Promise<{ data: ApiResponse<AuthTokenResponse>; headers: Headers }>;

/** Runs a call that starts a session and pairs the body's access token with the refresh cookie. */
export async function toAuthSession(call: TokenCall): Promise<AuthSession> {
  const { data, headers } = await call();
  const body = unwrap(data);
  const refreshToken = readSetCookie(headers.getSetCookie(), BACKEND_REFRESH_COOKIE);
  if (!refreshToken) {
    throw new Error("auth-service response has no refresh-token cookie");
  }
  return {
    accessToken: body.accessToken,
    refreshToken,
    expiresIn: body.expiresIn,
    phoneVerified: body.phoneVerified,
  };
}

/** Exchanges a refresh token for a new pair (the backend rotates it). */
export function refreshSession(refreshToken: string, headers: Record<string, string>) {
  return toAuthSession(() =>
    authApi.postRaw<ApiResponse<AuthTokenResponse>>("/api/auth/refresh-token", undefined, {
      cache: "no-store",
      headers,
      cookie: { [BACKEND_REFRESH_COOKIE]: refreshToken },
    }),
  );
}
```

- [ ] **Step 9: Replace `src/features/auth/services/auth.service.ts`**

```ts
import "server-only";

import { unwrap, type ApiResponse, type RequestOptions } from "@/lib/api";
import { BACKEND_REFRESH_COOKIE } from "../constants";
import type { LoginInput, RegisterInput, ResetPasswordInput } from "../schemas/auth.schema";
import type {
  AuthTokenResponse,
  PasswordForgotResult,
  UserProfile,
  VerificationSendResult,
} from "../types/auth.types";
import { authApi, toAuthSession } from "./auth-api";

/** The signed-in user's access token and the real client's headers (see forwarded-headers.ts). */
export type CallContext = { accessToken?: string; headers?: Record<string, string> };

function options({ accessToken, headers }: CallContext): RequestOptions {
  return { cache: "no-store", accessToken, headers };
}

export const authService = {
  login(input: LoginInput, context: CallContext = {}) {
    return toAuthSession(() =>
      authApi.postRaw<ApiResponse<AuthTokenResponse>>("/api/auth/login", input, options(context)),
    );
  },

  register(input: RegisterInput, context: CallContext = {}) {
    return toAuthSession(() =>
      authApi.postRaw<ApiResponse<AuthTokenResponse>>("/api/users/command/register", input, options(context)),
    );
  },

  async logout(refreshToken: string, context: CallContext = {}) {
    await authApi.post("/api/auth/logout", undefined, {
      ...options(context),
      cookie: { [BACKEND_REFRESH_COOKIE]: refreshToken },
    });
  },

  async getProfile(accessToken: string) {
    return unwrap(
      await authApi.get<ApiResponse<UserProfile>>("/api/user/query/my-info", options({ accessToken })),
    );
  },

  async sendPhoneCode(context: CallContext) {
    return unwrap(
      await authApi.post<ApiResponse<VerificationSendResult>>(
        "/api/auth/verification/phone/send",
        undefined,
        options(context),
      ),
    );
  },

  async confirmPhone(code: string, context: CallContext) {
    await authApi.post("/api/auth/verification/phone/confirm", { code }, options(context));
  },

  async forgotPasswordByEmail(email: string, context: CallContext = {}) {
    return unwrap(
      await authApi.post<ApiResponse<PasswordForgotResult>>("/api/auth/forgot-password", { email }, options(context)),
    );
  },

  async forgotPasswordBySms(phoneNumber: string, context: CallContext = {}) {
    return unwrap(
      await authApi.post<ApiResponse<PasswordForgotResult>>(
        "/api/auth/forgot-password/sms",
        { phoneNumber },
        options(context),
      ),
    );
  },

  async resetPassword(input: ResetPasswordInput, context: CallContext = {}) {
    await authApi.post("/api/auth/reset-password", input, options(context));
  },
};
```

- [ ] **Step 10: Replace `src/features/auth/index.ts`** (grows in later tasks)

```ts
export { AUTH_ROUTES } from "./constants";
export type { AuthSession, UserProfile } from "./types/auth.types";
```

- [ ] **Step 11: Run the tests, verify and commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass. If `npm run lint` reports errors in the legacy `src/features/auth/*.jsx` files, delete them now with the command in Task 13 Step 1. They are untracked, and their originals stay in `business-ui`.
```bash
git add src/features/auth/types src/features/auth/schemas src/features/auth/services src/features/auth/index.ts
git commit -m "feat(auth): add zod schemas and auth-service client"
```

---

### Task 4: Session storage, form-state mapping and the Data Access Layer

**Files:**
- Create: `src/features/auth/session/cookies.ts`
- Create: `src/features/auth/session/dal.ts`
- Create: `src/features/auth/lib/client-context.ts`
- Create: `src/features/auth/lib/form-state.ts` + `form-state.test.ts`

**Interfaces:**
- Consumes: cookie-config (Task 2), `forwardedHeaders` (Task 2), `authService`, types (Task 3), `ApiError` (Task 1).
- Produces:
  - `saveSession(session: Pick<AuthSession, "accessToken" | "refreshToken" | "expiresIn">): Promise<void>`, `clearSession(): Promise<void>`, `readSessionTokens(): Promise<{ accessToken?: string; refreshToken?: string }>`
  - `saveResetToken(token)`, `readResetToken(): Promise<string | undefined>`, `clearResetToken()`
  - `clientContextHeaders(): Promise<Record<string, string>>`
  - `FormState`, `FieldErrors`, `initialFormState`, `readForm(formData, fields)`, `validationError(error, values?)`, `formStateFromError(error, { values?, overrides? })`
  - `SessionUser`, `hasSession()`, `getSessionUser()`, `requireUser(returnTo: string)`, `expiredSessionUrl(returnTo: string)`

- [ ] **Step 1: Write the failing test `src/features/auth/lib/form-state.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { formStateFromError, readForm, validationError } from "./form-state";

afterEach(() => vi.restoreAllMocks());

describe("readForm", () => {
  it("reads named fields as strings, empty when missing", () => {
    const data = new FormData();
    data.set("username", "0901234567");
    expect(readForm(data, ["username", "password"])).toEqual({ username: "0901234567", password: "" });
  });
});

describe("validationError", () => {
  it("returns zod field errors and the values to refill", () => {
    const result = z.object({ email: z.email("Bad email") }).safeParse({ email: "x" });
    if (result.success) throw new Error("expected failure");
    expect(validationError(result.error, { email: "x" })).toEqual({
      status: "error",
      fieldErrors: { email: ["Bad email"] },
      values: { email: "x" },
    });
  });
});

describe("formStateFromError", () => {
  it("maps backend field errors onto fields", () => {
    const error = new ApiError(409, "Validation failed", {
      errors: [{ field: "username", message: "Phone number already registered." }],
    });
    expect(formStateFromError(error)).toEqual({
      status: "error",
      fieldErrors: { username: ["Phone number already registered."] },
      values: undefined,
    });
  });

  it("uses a per-status override first", () => {
    const error = new ApiError(401, "Bad credentials");
    expect(formStateFromError(error, { overrides: { 401: "Phone number or password is incorrect." } }).message).toBe(
      "Phone number or password is incorrect.",
    );
  });

  it("explains lockouts and rate limits with the wait time", () => {
    expect(formStateFromError(new ApiError(423, "Locked", undefined, 300)).message).toBe(
      "Too many failed attempts. Try again in 5 minutes.",
    );
    expect(formStateFromError(new ApiError(429, "Slow down", undefined, 45)).message).toBe(
      "Too many requests. Please wait 45 seconds and try again.",
    );
  });

  it("says the code is wrong or expired on 400", () => {
    expect(formStateFromError(new ApiError(400, "Invalid OTP")).message).toBe("The code is incorrect or has expired.");
  });

  it("hides server errors and network failures behind a generic message", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const generic = "We couldn't reach the server. Please try again.";
    expect(formStateFromError(new ApiError(500, "NullPointerException")).message).toBe(generic);
    expect(formStateFromError(new TypeError("fetch failed")).message).toBe(generic);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("keeps the submitted values", () => {
    expect(formStateFromError(new ApiError(400, "x"), { values: { username: "0901234567" } }).values).toEqual({
      username: "0901234567",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/features/auth/lib/form-state`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/features/auth/lib/form-state.ts`**

```ts
import { z } from "zod";
import { ApiError } from "@/lib/api";

export type FieldErrors = Partial<Record<string, string[]>>;

/** What every auth Server Action returns to its form through `useActionState`. */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Submitted values to refill the form after an error. Never contains passwords. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };

const GENERIC_ERROR = "We couldn't reach the server. Please try again.";

export function readForm<const K extends string>(formData: FormData, fields: readonly K[]): Record<K, string> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" ? value : ""];
    }),
  ) as Record<K, string>;
}

export function validationError(error: z.ZodError, values?: Record<string, string>): FormState {
  return { status: "error", fieldErrors: z.flattenError(error).fieldErrors as FieldErrors, values };
}

type ErrorOptions = {
  values?: Record<string, string>;
  /** Message to show for a given HTTP status, e.g. `{ 401: "Wrong password" }`. */
  overrides?: Partial<Record<number, string>>;
};

export function formStateFromError(error: unknown, { values, overrides = {} }: ErrorOptions = {}): FormState {
  const fail = (message: string): FormState => ({ status: "error", message, values });

  if (!(error instanceof ApiError)) {
    console.error("[auth] Backend call failed:", error instanceof Error ? error.message : error);
    return fail(GENERIC_ERROR);
  }

  const override = overrides[error.status];
  if (override) return fail(override);

  if (error.fieldErrors.length > 0) {
    const fieldErrors: FieldErrors = {};
    for (const { field, message } of error.fieldErrors) {
      (fieldErrors[field] ??= []).push(message);
    }
    return { status: "error", fieldErrors, values };
  }

  switch (error.status) {
    case 400:
      return fail("The code is incorrect or has expired.");
    case 423:
      return fail(`Too many failed attempts. Try again in ${formatWait(error.retryAfterSeconds)}.`);
    case 429:
      return fail(`Too many requests. Please wait ${formatWait(error.retryAfterSeconds)} and try again.`);
  }

  if (error.status >= 500) {
    console.error(`[auth] Backend answered ${error.status}`);
    return fail(GENERIC_ERROR);
  }
  return fail(error.message || GENERIC_ERROR);
}

function formatWait(seconds?: number) {
  if (!seconds) return "a few minutes";
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/features/auth/lib/form-state`
Expected: PASS.

- [ ] **Step 5: Implement `src/features/auth/lib/client-context.ts`**

```ts
import "server-only";

import { headers } from "next/headers";
import { forwardedHeaders } from "./forwarded-headers";

/** The real client's User-Agent and IP, to forward on every auth-service call. */
export async function clientContextHeaders() {
  return forwardedHeaders(await headers());
}
```

- [ ] **Step 6: Implement `src/features/auth/session/cookies.ts`**

```ts
import "server-only";

import { cookies } from "next/headers";
import type { AuthSession } from "../types/auth.types";
import {
  accessCookieOptions,
  expiredCookieOptions,
  refreshCookieOptions,
  RESET_TOKEN_COOKIE,
  resetCookieOptions,
  sessionCookieNames,
} from "./cookie-config";

// Writes only work in Server Actions and Route Handlers; reads work anywhere
// on the server but must sit behind <Suspense> (cacheComponents).

export async function saveSession(session: Pick<AuthSession, "accessToken" | "refreshToken" | "expiresIn">) {
  const store = await cookies();
  const names = sessionCookieNames();
  store.set(names.access, session.accessToken, accessCookieOptions(session.expiresIn));
  store.set(names.refresh, session.refreshToken, refreshCookieOptions());
}

export async function clearSession() {
  const store = await cookies();
  const names = sessionCookieNames();
  store.set(names.access, "", expiredCookieOptions(accessCookieOptions(0)));
  store.set(names.refresh, "", expiredCookieOptions(refreshCookieOptions()));
}

export async function readSessionTokens(): Promise<{ accessToken?: string; refreshToken?: string }> {
  const store = await cookies();
  const names = sessionCookieNames();
  return {
    accessToken: store.get(names.access)?.value || undefined,
    refreshToken: store.get(names.refresh)?.value || undefined,
  };
}

export async function saveResetToken(token: string) {
  (await cookies()).set(RESET_TOKEN_COOKIE, token, resetCookieOptions());
}

export async function readResetToken(): Promise<string | undefined> {
  return (await cookies()).get(RESET_TOKEN_COOKIE)?.value || undefined;
}

export async function clearResetToken() {
  (await cookies()).set(RESET_TOKEN_COOKIE, "", expiredCookieOptions(resetCookieOptions()));
}
```

- [ ] **Step 7: Implement `src/features/auth/session/dal.ts`**

```ts
import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { ApiError } from "@/lib/api";
import { AUTH_ROUTES } from "../constants";
import { authService } from "../services/auth.service";
import { readSessionTokens } from "./cookies";

/** What pages may know about the signed-in user. */
export type SessionUser = {
  fullName: string;
  phoneNumber: string;
  email: string | null;
  accountStatus: string;
  phoneVerified: boolean;
  emailVerified: boolean;
};

/** Whether session cookies exist. No backend call: for UI hints only, never for authorization. */
export async function hasSession(): Promise<boolean> {
  const { accessToken, refreshToken } = await readSessionTokens();
  return Boolean(accessToken || refreshToken);
}

/** The signed-in user, or null. At most one backend call per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const { accessToken } = await readSessionTokens();
  if (!accessToken) return null;
  try {
    const profile = await authService.getProfile(accessToken);
    return {
      fullName: profile.fullName,
      phoneNumber: profile.username,
      email: profile.email,
      accountStatus: profile.accountStatus,
      phoneVerified: profile.phoneVerified,
      emailVerified: profile.emailVerified,
    };
  } catch (error) {
    if (error instanceof ApiError && (error.isUnauthorized || error.isNotFound)) return null;
    throw error;
  }
});

/** Login URL for a session the backend no longer accepts. The proxy lets it through even with stale cookies. */
export function expiredSessionUrl(returnTo: string) {
  return `${AUTH_ROUTES.login}?session=expired&next=${encodeURIComponent(returnTo)}`;
}

/** The signed-in user; otherwise redirects to the login page and comes back to `returnTo`. */
export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(expiredSessionUrl(returnTo));
  return user;
}
```

- [ ] **Step 8: Verify and commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
```bash
git add src/features/auth/session src/features/auth/lib
git commit -m "feat(auth): add session cookies, error mapping and data access layer"
```

---

### Task 5: Silent refresh and route guards in the proxy

**Files:**
- Create: `src/features/auth/session/refresh.ts` + `refresh.test.ts`
- Create: `src/features/auth/session/route-guard.ts` + `route-guard.test.ts`
- Create: `src/features/auth/proxy.ts` + `proxy.test.ts`
- Create: `src/proxy.ts`
- Modify: `eslint.config.mjs` (allow `@/features/*/proxy`)

**Interfaces:**
- Consumes: `refreshSession` (Task 3), cookie-config, `forwardedHeaders`, `AUTH_ROUTES`/paths (Task 2), `ApiError`.
- Produces:
  - `refreshIfNeeded(tokens: { access?: string; refresh?: string }, headers: Record<string, string>, refresh?: typeof refreshSession): Promise<RefreshOutcome>`
  - `guardRedirect(url: URL, signedIn: boolean): URL | null`
  - `authProxy(request: NextRequest, refresh?: typeof refreshSession): Promise<NextResponse>`

- [ ] **Step 1: Write the failing tests**

`src/features/auth/session/route-guard.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { guardRedirect } from "./route-guard";

const at = (path: string) => new URL(path, "http://localhost:3000");

describe("guardRedirect", () => {
  it("sends signed-out visitors of protected pages to login with a return path", () => {
    expect(guardRedirect(at("/account?tab=1"), false)?.toString()).toBe(
      "http://localhost:3000/login?next=%2Faccount%3Ftab%3D1",
    );
    expect(guardRedirect(at("/verify-phone"), false)?.pathname).toBe("/login");
  });

  it("sends signed-in users away from guest-only pages", () => {
    expect(guardRedirect(at("/login"), true)?.pathname).toBe("/account");
    expect(guardRedirect(at("/sign-up"), true)?.pathname).toBe("/account");
  });

  it("lets a stale session reach the login page when the server said it expired", () => {
    expect(guardRedirect(at("/login?session=expired&next=%2Faccount"), true)).toBeNull();
  });

  it("leaves every other page alone", () => {
    expect(guardRedirect(at("/"), false)).toBeNull();
    expect(guardRedirect(at("/reset-password?token=x"), true)).toBeNull();
    expect(guardRedirect(at("/accounting"), false)).toBeNull();
  });
});
```

`src/features/auth/session/refresh.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { refreshIfNeeded } from "./refresh";

const session = { accessToken: "a2", refreshToken: "r2", expiresIn: 900, phoneVerified: true };

afterEach(() => vi.restoreAllMocks());

describe("refreshIfNeeded", () => {
  it("does nothing while the access token is still there or without a refresh token", async () => {
    const refresh = vi.fn();
    expect(await refreshIfNeeded({ access: "a1", refresh: "r1" }, {}, refresh)).toEqual({ kind: "none" });
    expect(await refreshIfNeeded({}, {}, refresh)).toEqual({ kind: "none" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when only the refresh token is left", async () => {
    const refresh = vi.fn(async () => session);
    const outcome = await refreshIfNeeded({ refresh: "r1" }, { "User-Agent": "UA" }, refresh);
    expect(outcome).toEqual({ kind: "refreshed", session });
    expect(refresh).toHaveBeenCalledWith("r1", { "User-Agent": "UA" });
  });

  it("ends the session when the backend rejects the refresh token", async () => {
    const refresh = vi.fn(async () => {
      throw new ApiError(401, "Invalid refresh token");
    });
    expect(await refreshIfNeeded({ refresh: "r1" }, {}, refresh)).toEqual({ kind: "expired" });
  });

  it("keeps the session when the backend is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const refresh = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await refreshIfNeeded({ refresh: "r1" }, {}, refresh)).toEqual({ kind: "unavailable" });
  });
});
```

`src/features/auth/proxy.test.ts`:
```ts
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { authProxy } from "./proxy";

const session = { accessToken: "a2", refreshToken: "r2", expiresIn: 900, phoneVerified: true };

function request(path: string, cookie = "", method = "GET") {
  return new NextRequest(new URL(path, "http://localhost:3000"), { method, headers: { cookie } });
}

describe("authProxy", () => {
  it("refreshes an expired access token and sets both cookies on the response", async () => {
    const refresh = vi.fn(async () => session);
    const response = await authProxy(request("/account", "sv_rt=r1"), refresh);

    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("sv_at")?.value).toBe("a2");
    expect(response.cookies.get("sv_rt")?.value).toBe("r2");
  });

  it("refreshes before a Server Action POST runs", async () => {
    const refresh = vi.fn(async () => session);
    const response = await authProxy(request("/verify-phone", "sv_rt=r1", "POST"), refresh);
    expect(refresh).toHaveBeenCalledOnce();
    expect(response.cookies.get("sv_at")?.value).toBe("a2");
  });

  it("clears cookies and redirects to login when the refresh token is rejected", async () => {
    const { ApiError } = await import("@/lib/api");
    const refresh = vi.fn(async () => {
      throw new ApiError(401, "expired");
    });
    const response = await authProxy(request("/account", "sv_rt=r1"), refresh);

    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
    expect(response.cookies.get("sv_rt")?.value).toBe("");
  });

  it("redirects a signed-out visitor away from a protected page without calling the backend", async () => {
    const refresh = vi.fn();
    const response = await authProxy(request("/account"), refresh);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/features/auth/session/route-guard src/features/auth/session/refresh src/features/auth/proxy`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/features/auth/session/route-guard.ts`**

```ts
import { AUTH_ROUTES, GUEST_ONLY_PATHS, PROTECTED_PATHS } from "../constants";

const matches = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/**
 * Optimistic redirect based on cookie presence only. Pages still authorize
 * through the DAL; this only saves a round trip and a flash of the wrong page.
 */
export function guardRedirect(url: URL, signedIn: boolean): URL | null {
  const path = url.pathname;

  if (!signedIn && PROTECTED_PATHS.some((base) => matches(path, base))) {
    const login = new URL(AUTH_ROUTES.login, url);
    login.searchParams.set("next", `${path}${url.search}`);
    return login;
  }

  // `session` is set when the server found the cookies stale (dal.expiredSessionUrl):
  // bouncing back to /account would loop.
  if (signedIn && !url.searchParams.has("session") && GUEST_ONLY_PATHS.some((base) => matches(path, base))) {
    return new URL(AUTH_ROUTES.account, url);
  }

  return null;
}
```

- [ ] **Step 4: Implement `src/features/auth/session/refresh.ts`**

```ts
import { ApiError } from "@/lib/api";
import { refreshSession } from "../services/auth-api";
import type { AuthSession } from "../types/auth.types";

export type RefreshOutcome =
  | { kind: "none" }
  | { kind: "refreshed"; session: AuthSession }
  /** The backend rejected the refresh token: the session is over. */
  | { kind: "expired" }
  /** The backend couldn't be reached: keep the cookies and try on the next request. */
  | { kind: "unavailable" };

export async function refreshIfNeeded(
  tokens: { access?: string; refresh?: string },
  headers: Record<string, string>,
  refresh: typeof refreshSession = refreshSession,
): Promise<RefreshOutcome> {
  if (tokens.access || !tokens.refresh) return { kind: "none" };
  try {
    return { kind: "refreshed", session: await refresh(tokens.refresh, headers) };
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) return { kind: "expired" };
    console.error("[auth] Token refresh failed:", error instanceof Error ? error.message : error);
    return { kind: "unavailable" };
  }
}
```

- [ ] **Step 5: Implement `src/features/auth/proxy.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { forwardedHeaders } from "./lib/forwarded-headers";
import { refreshSession } from "./services/auth-api";
import {
  accessCookieOptions,
  expiredCookieOptions,
  refreshCookieOptions,
  sessionCookieNames,
} from "./session/cookie-config";
import { refreshIfNeeded } from "./session/refresh";
import { guardRedirect } from "./session/route-guard";

// Public entry point for src/proxy.ts. Keep it free of React and next/headers.

export async function authProxy(
  request: NextRequest,
  refresh: typeof refreshSession = refreshSession,
): Promise<NextResponse> {
  const names = sessionCookieNames();
  const tokens = {
    access: request.cookies.get(names.access)?.value || undefined,
    refresh: request.cookies.get(names.refresh)?.value || undefined,
  };
  const outcome = await refreshIfNeeded(tokens, forwardedHeaders(request.headers), refresh);

  let signedIn = Boolean(tokens.access || tokens.refresh);
  if (outcome.kind === "refreshed") {
    // Also update the forwarded request so this very render sees the new token.
    request.cookies.set(names.access, outcome.session.accessToken);
    request.cookies.set(names.refresh, outcome.session.refreshToken);
  } else if (outcome.kind === "expired") {
    request.cookies.delete(names.access);
    request.cookies.delete(names.refresh);
    signedIn = false;
  }

  const redirectTo = guardRedirect(request.nextUrl, signedIn);
  const response = redirectTo
    ? NextResponse.redirect(redirectTo)
    : NextResponse.next({ request: { headers: request.headers } });

  if (outcome.kind === "refreshed") {
    response.cookies.set(names.access, outcome.session.accessToken, accessCookieOptions(outcome.session.expiresIn));
    response.cookies.set(names.refresh, outcome.session.refreshToken, refreshCookieOptions());
  } else if (outcome.kind === "expired") {
    response.cookies.set(names.access, "", expiredCookieOptions(accessCookieOptions(0)));
    response.cookies.set(names.refresh, "", expiredCookieOptions(refreshCookieOptions()));
  }
  return response;
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- src/features/auth`
Expected: PASS. If `new NextRequest(...)` fails under Vitest, check the error. `next/server` must be importable in Node; if it needs `globalThis.Request`, Node 25 provides it.

- [ ] **Step 7: Create `src/proxy.ts`**

```ts
import type { NextRequest } from "next/server";
import { authProxy } from "@/features/auth/proxy";

export function proxy(request: NextRequest) {
  return authProxy(request);
}

export const config = {
  matcher: [
    // Every page and Server Action, but not Next.js internals, metadata images or static files.
    "/((?!_next/static|_next/image|favicon.ico|icon.png|opengraph-image|twitter-image|images/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)",
  ],
};
```

- [ ] **Step 8: Allow the proxy entry point in `eslint.config.mjs`**

Replace `group: ["@/features/*/*"],` with:
```js
              group: ["@/features/*/*", "!@/features/*/proxy"],
```
and the message with:
```js
                "Import from the feature's public API (e.g. '@/features/property'), not its internals. src/proxy.ts may use '@/features/<name>/proxy'.",
```

- [ ] **Step 9: Verify, build and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected:
- all pass;
- the build output lists `ƒ Proxy (Middleware)`;
- `npx eslint src/proxy.ts` reports nothing.
```bash
git add src/proxy.ts src/features/auth/proxy.ts src/features/auth/proxy.test.ts src/features/auth/session eslint.config.mjs
git commit -m "feat(auth): refresh the session and guard routes in the proxy"
```

---

### Task 6: Shared UI primitives and icons

**Files:**
- Create: `src/components/ui/button.tsx`, `submit-button.tsx`, `input.tsx`, `form-field.tsx`, `alert.tsx`, `password-input.tsx`, `otp-input.tsx`
- Create: `src/components/ui/sanitize-otp.ts` + `sanitize-otp.test.ts`
- Modify: `src/components/icons/index.tsx` (add icons)

**Interfaces:**
- Produces:
  - `Button({ variant?: "primary" | "secondary" | "ghost", pending?, fullWidth?, ...button props })`
  - `SubmitButton({ children, variant?, fullWidth? })`, pending from `useFormStatus`
  - `Input({ invalid?, ...input props })`
  - `FormField({ id, label, error?, hint?, optional?, labelAction?, children })`
  - `Alert({ tone?: "error" | "success" | "info", title?, children })`
  - `PasswordInput(props without type)`
  - `OtpInput({ id, name, label, length?, invalid?, autoFocus?, describedBy? })`
  - `sanitizeOtp(value: string, maxLength: number): string`
  - Icons `EyeIcon`, `EyeOffIcon`, `CheckIcon`, `CircleIcon`, `UserIcon`, `LogOutIcon`, `ShieldCheckIcon`

- [ ] **Step 1: Write the failing test `src/components/ui/sanitize-otp.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { sanitizeOtp } from "./sanitize-otp";

describe("sanitizeOtp", () => {
  it.each([
    ["123456", "123456"],
    ["123 456", "123456"],
    ["123-456", "123456"],
    [" 12a34b56 ", "123456"],
    ["1234567890", "123456"],
  ])("cleans %j", (input, expected) => {
    expect(sanitizeOtp(input, 6)).toBe(expected);
  });

  it("respects a shorter remaining length", () => {
    expect(sanitizeOtp("98765", 2)).toBe("98");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/ui`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/components/ui/sanitize-otp.ts`**

```ts
/** Digits only, at most `maxLength` of them: "123 456" or "123-456" → "123456". */
export function sanitizeOtp(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, Math.max(0, maxLength));
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/components/ui`
Expected: PASS.

- [ ] **Step 5: Add icons to `src/components/icons/index.tsx`** (append after `ChatIcon`)

```tsx
export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.16 3.19" />
      <path d="M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="m2 2 20 20" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function CircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Icon>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Icon>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}
```

- [ ] **Step 6: Create `src/components/ui/button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  pending?: boolean;
  fullWidth?: boolean;
};

const variants = {
  primary: "bg-brand-gradient text-white shadow-lg shadow-violet-600/25 hover:shadow-xl hover:brightness-110",
  secondary: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-violet-200 hover:bg-violet-50/50",
  ghost: "text-violet-700 hover:bg-violet-50",
};

export function Button({
  variant = "primary",
  pending = false,
  fullWidth = false,
  disabled,
  type = "button",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100 ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {pending && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}
```

- [ ] **Step 7: Create `src/components/ui/submit-button.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/** Submit button that shows a spinner and blocks double submits while its form's action runs. */
export function SubmitButton({
  children,
  variant = "primary",
  fullWidth = true,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} fullWidth={fullWidth} pending={pending}>
      {children}
    </Button>
  );
}
```

- [ ] **Step 8: Create `src/components/ui/input.tsx`**

```tsx
import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function Input({ invalid = false, className = "", ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`block w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-4 ${
        invalid
          ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
          : "border-slate-200 focus:border-violet-400 focus:ring-violet-100"
      } ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 9: Create `src/components/ui/form-field.tsx`**

```tsx
import type { ReactNode } from "react";

type FormFieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  /** Shown at the right of the label, e.g. a "Forgot password?" link. */
  labelAction?: ReactNode;
  children: ReactNode;
};

/** Label, control and message. Give the control `aria-describedby={describedBy(id, error)}`. */
export function FormField({ id, label, error, hint, optional, labelAction, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
          {optional && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
        </label>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <div id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, error?: string, hasHint = false) {
  if (error) return `${id}-error`;
  return hasHint ? `${id}-hint` : undefined;
}
```

- [ ] **Step 10: Create `src/components/ui/alert.tsx`**

```tsx
import type { ReactNode } from "react";

const tones = {
  error: "border-rose-200 bg-rose-50 text-rose-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-violet-200 bg-violet-50 text-violet-900",
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5" : undefined}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 11: Create `src/components/ui/password-input.tsx`**

```tsx
"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { Input, type InputProps } from "./input";

export function PasswordInput(props: Omit<InputProps, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-12" />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-violet-600"
      >
        {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </div>
  );
}
```

- [ ] **Step 12: Create `src/components/ui/otp-input.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { sanitizeOtp } from "./sanitize-otp";

type OtpInputProps = {
  /** Applied to the first box so a <label htmlFor> points at it. */
  id: string;
  /** Name of the hidden input that carries the full code. */
  name: string;
  label: string;
  length?: number;
  invalid?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
};

/** One box per digit; supports typing, paste, SMS autofill, backspace and arrow keys. */
export function OtpInput({ id, name, label, length = 6, invalid, autoFocus, describedBy }: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length }, () => ""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  const focusBox = (index: number) => boxes.current[Math.max(0, Math.min(length - 1, index))]?.focus();

  const fillFrom = (start: number, value: string) => {
    const chars = sanitizeOtp(value, length - start).split("");
    if (chars.length === 0) return;
    setDigits((previous) => {
      const next = [...previous];
      chars.forEach((char, offset) => {
        next[start + offset] = char;
      });
      return next;
    });
    focusBox(start + chars.length);
  };

  const clear = (index: number) =>
    setDigits((previous) => previous.map((digit, i) => (i === index ? "" : digit)));

  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex justify-between gap-2 sm:gap-3">
      <input type="hidden" name={name} value={digits.join("")} />
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          id={index === 0 ? id : undefined}
          value={digit}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={length}
          autoFocus={autoFocus && index === 0}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          onFocus={(event) => event.target.select()}
          onChange={(event) => {
            if (event.target.value === "") clear(index);
            else fillFrom(index, event.target.value.slice(digit ? 1 : 0) || event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digit && index > 0) {
              event.preventDefault();
              clear(index - 1);
              focusBox(index - 1);
            } else if (event.key === "ArrowLeft") {
              focusBox(index - 1);
            } else if (event.key === "ArrowRight") {
              focusBox(index + 1);
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            fillFrom(index, event.clipboardData.getData("text"));
          }}
          className={`h-12 w-full min-w-0 rounded-xl border bg-white text-center text-lg font-semibold text-navy-950 shadow-sm transition-colors focus:outline-none focus:ring-4 sm:h-14 ${
            invalid
              ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
              : "border-slate-200 focus:border-violet-400 focus:ring-violet-100"
          }`}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 13: Verify and commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
```bash
git add src/components
git commit -m "feat(ui): add form primitives, OTP input and icons"
```

---

### Task 7: Auth layout shell, illustration, error boundary and title template

**Files:**
- Modify: `src/components/brand/logo.tsx` (add `tone`)
- Modify: `src/app/layout.tsx` (title template)
- Create: `src/features/auth/components/auth-illustration.tsx`, `auth-shell.tsx`, `auth-header.tsx`, `form-skeleton.tsx`, `auth-error.tsx`
- Create: `src/app/(auth)/layout.tsx`, `src/app/(auth)/error.tsx`
- Modify: `src/features/auth/index.ts`

**Interfaces:**
- Produces: `AuthShell({ children })`, `AuthHeader({ title, description })`, `FormSkeleton({ fields? })`, `AuthError` (error boundary body), `Logo({ className?, tone?: "dark" | "light" })`.

- [ ] **Step 1: Add a light tone to `src/components/brand/logo.tsx`**

Change the signature to:
```tsx
export function Logo({ className = "", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
```
and the name span's class to:
```tsx
      <span className={`text-xl font-semibold tracking-tight ${tone === "light" ? "text-white" : "text-navy-950"}`}>
```

- [ ] **Step 2: Add a title template in `src/app/layout.tsx`**

Replace `title: siteConfig.title,` (the top-level one, not inside `openGraph`/`twitter`) with:
```tsx
  title: { default: siteConfig.title, template: `%s | ${siteConfig.name}` },
```

- [ ] **Step 3: Create `src/features/auth/components/auth-illustration.tsx`**

```tsx
/** Brand illustration for the auth pages: buildings, an AI chat bubble and a match card. */
export function AuthIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 300" className={className} role="img" aria-label="Apartments matched to tenants by Sunvibe AI">
      <defs>
        <linearGradient id="auth-illus-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="35%" stopColor="#f43f5e" />
          <stop offset="70%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="auth-illus-cool" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>

      <ellipse cx="200" cy="268" rx="170" ry="14" fill="white" fillOpacity="0.06" />

      {/* Tall glass tower */}
      <rect x="78" y="58" width="104" height="208" rx="14" fill="white" fillOpacity="0.06" stroke="white" strokeOpacity="0.18" />
      {[0, 1, 2, 3, 4, 5].map((row) =>
        [0, 1, 2].map((col) => (
          <rect
            key={`t-${row}-${col}`}
            x={94 + col * 28}
            y={78 + row * 28}
            width="18"
            height="14"
            rx="3"
            fill={(row + col) % 4 === 1 ? "url(#auth-illus-cool)" : "white"}
            fillOpacity={(row + col) % 4 === 1 ? 1 : 0.18}
          />
        )),
      )}

      {/* Gradient apartment block */}
      <rect x="192" y="118" width="124" height="148" rx="14" fill="url(#auth-illus-brand)" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => (
          <rect key={`a-${row}-${col}`} x={208 + col * 34} y={136 + row * 30} width="22" height="16" rx="3" fill="#04052b" fillOpacity="0.35" />
        )),
      )}
      <rect x="240" y="226" width="28" height="40" rx="5" fill="#04052b" fillOpacity="0.45" />

      {/* AI assistant bubble */}
      <g transform="translate(286 44)">
        <path d="M0 18a18 18 0 0 1 18-18h52a18 18 0 0 1 18 18v14a18 18 0 0 1-18 18H26l-14 12v-13A18 18 0 0 1 0 32Z" fill="white" />
        <circle cx="30" cy="25" r="4" fill="#7c3aed" />
        <circle cx="44" cy="25" r="4" fill="#a855f7" />
        <circle cx="58" cy="25" r="4" fill="#22d3ee" />
      </g>

      {/* Match card */}
      <g transform="translate(22 182)">
        <rect width="118" height="54" rx="14" fill="white" />
        <circle cx="26" cy="27" r="13" fill="url(#auth-illus-cool)" />
        <rect x="46" y="16" width="52" height="8" rx="4" fill="#0c0e45" fillOpacity="0.8" />
        <rect x="46" y="31" width="38" height="7" rx="3.5" fill="#7c3aed" fillOpacity="0.35" />
      </g>

      {/* Sparkles */}
      <path d="M352 150l4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" fill="#22d3ee" fillOpacity="0.9" />
      <path d="M50 92l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#f97316" fillOpacity="0.9" />
    </svg>
  );
}
```

- [ ] **Step 4: Create `src/features/auth/components/auth-shell.tsx`**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { BrainIcon, ChatIcon, FileCheckIcon } from "@/components/icons";
import { siteConfig } from "@/config/site";
import { AuthIllustration } from "./auth-illustration";

const highlights = [
  { icon: <BrainIcon size={18} />, text: "AI matchmaking between landlords and tenants" },
  { icon: <FileCheckIcon size={18} />, text: "Digital leases, checks and rent tracking" },
  { icon: <ChatIcon size={18} />, text: "A leasing assistant that answers 24/7" },
];

/** Split-screen layout for the sign-in pages: brand panel on large screens, form on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="relative hidden w-[44%] max-w-xl flex-col overflow-hidden bg-navy-950 p-10 text-white lg:flex xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_20%_110%,rgba(249,115,22,0.35),transparent_70%),radial-gradient(ellipse_60%_50%_at_90%_100%,rgba(34,211,238,0.25),transparent_70%),radial-gradient(ellipse_70%_60%_at_50%_-10%,rgba(139,92,246,0.35),transparent_70%)]"
        />
        <Link href="/" className="relative w-fit" aria-label={`${siteConfig.name} home`}>
          <Logo tone="light" />
        </Link>
        <div className="relative my-auto py-10">
          <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight">
            Renting, made effortless by AI.
          </h2>
          <AuthIllustration className="mt-10 w-full max-w-md" />
          <ul className="mt-10 space-y-4">
            {highlights.map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-cyan-300">
                  {item.icon}
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-400">© 2026 {siteConfig.legalName}</p>
      </aside>

      <main id="top" className="flex flex-1 flex-col">
        <div className="px-4 pt-6 sm:px-8 lg:hidden">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            <Logo />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
        <p className="px-4 pb-6 text-center text-xs text-slate-400 sm:px-8">
          Need help? <a href={siteConfig.links.contact} className="font-medium text-slate-600 hover:text-violet-700">{siteConfig.contactEmail}</a>
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/features/auth/components/auth-header.tsx`**

```tsx
export function AuthHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight text-navy-950 sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">{description}</p>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/features/auth/components/form-skeleton.tsx`**

```tsx
/** Placeholder while a form waits for request data (search params, session). */
export function FormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="space-y-5" aria-hidden>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ))}
      <div className="h-12 animate-pulse rounded-full bg-slate-100" />
    </div>
  );
}
```

- [ ] **Step 7: Create `src/features/auth/components/auth-error.tsx`**

```tsx
"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Body of the route error boundaries under (auth), (onboarding) and (platform). */
export function AuthError({ retry }: { retry: () => void }) {
  return (
    <div className="space-y-4">
      <Alert tone="error" title="Something went wrong">
        We couldn&apos;t load this page. Please try again in a moment.
      </Alert>
      <Button variant="secondary" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
```

- [ ] **Step 8: Create `src/app/(auth)/layout.tsx` and `src/app/(auth)/error.tsx`**

```tsx
import { AuthShell } from "@/features/auth";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <AuthShell>{children}</AuthShell>;
}
```

```tsx
"use client";

import { AuthError } from "@/features/auth/client";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <AuthError retry={retry} />;
}
```

Error boundaries are client components, so they must not import the server barrel `@/features/auth`, which pulls in `server-only` modules. Add a client entry point `src/features/auth/client.ts`:
```ts
// Public entry point for Client Components (error boundaries); no server-only code.
export { AuthError } from "./components/auth-error";
```
and allow it in `eslint.config.mjs`: `group: ["@/features/*/*", "!@/features/*/proxy", "!@/features/*/client"],`. Update the rule message to mention `'@/features/<name>/client'`.

- [ ] **Step 9: Export the shell from `src/features/auth/index.ts`**

```ts
export { AuthHeader } from "./components/auth-header";
export { AuthShell } from "./components/auth-shell";
export { FormSkeleton } from "./components/form-skeleton";
export { AUTH_ROUTES } from "./constants";
export type { AuthSession, UserProfile } from "./types/auth.types";
```

- [ ] **Step 10: Verify, build and commit**

Run: `npm test && npm run lint && npm run build && npx tsc --noEmit`
Expected: all pass. No route uses the `(auth)` layout yet, so the build only proves it compiles.
```bash
git add src/components/brand/logo.tsx src/app/layout.tsx "src/app/(auth)" src/features/auth/components src/features/auth/client.ts src/features/auth/index.ts eslint.config.mjs
git commit -m "feat(auth): add split-screen auth shell and brand illustration"
```

---

### Task 8: Login

**Files:**
- Create: `src/features/auth/actions/login.action.ts` + `login.action.test.ts`
- Create: `src/features/auth/lib/use-field-errors.ts`
- Create: `src/features/auth/components/login-form.tsx`, `auth-notice.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Modify: `src/features/auth/index.ts`

**Interfaces:**
- Consumes: `loginSchema`, `authService.login`, `saveSession`, `clientContextHeaders`, form-state helpers, `safeRedirectPath`, `AUTH_ROUTES`, UI primitives.
- Produces:
  - `loginAction(prev: FormState, formData: FormData): Promise<FormState>`
  - `useFieldErrors(schema, serverErrors) => { onBlur, errorFor(name) }`
  - `LoginForm({ next?: string })`
  - `AuthNotice({ searchParams })`

- [ ] **Step 1: Write the failing test `src/features/auth/actions/login.action.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { saveSession } from "../session/cookies";
import { loginAction } from "./login.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({ authService: { login: vi.fn() } }));
vi.mock("../session/cookies", () => ({ saveSession: vi.fn() }));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({ "User-Agent": "UA" })) }));

const login = vi.mocked(authService.login);

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => vi.clearAllMocks());

describe("loginAction", () => {
  it("returns field errors without calling the backend", async () => {
    const state = await loginAction(initialFormState, form({ username: "12", password: "" }));
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.username).toBeDefined();
    expect(state.fieldErrors?.password).toBeDefined();
    expect(state.values).toEqual({ username: "12" });
    expect(login).not.toHaveBeenCalled();
  });

  it("saves the session and goes to `next` when the phone is verified", async () => {
    const session = { accessToken: "a", refreshToken: "r", expiresIn: 900, phoneVerified: true };
    login.mockResolvedValue(session);

    await expect(
      loginAction(initialFormState, form({ username: "0901234567", password: "pw", next: "/account?tab=1" })),
    ).rejects.toThrow("NEXT_REDIRECT:/account?tab=1");

    expect(login).toHaveBeenCalledWith({ username: "0901234567", password: "pw" }, { headers: { "User-Agent": "UA" } });
    expect(saveSession).toHaveBeenCalledWith(session);
  });

  it("goes to phone verification when the phone isn't verified, ignoring unsafe `next`", async () => {
    login.mockResolvedValue({ accessToken: "a", refreshToken: "r", expiresIn: 900, phoneVerified: false });
    await expect(
      loginAction(initialFormState, form({ username: "0901234567", password: "pw", next: "//evil.com" })),
    ).rejects.toThrow("NEXT_REDIRECT:/verify-phone");
  });

  it("shows a clear message for wrong credentials and keeps the phone number", async () => {
    login.mockRejectedValue(new ApiError(401, "Bad credentials"));
    const state = await loginAction(initialFormState, form({ username: "0901234567", password: "wrong" }));
    expect(state).toEqual({
      status: "error",
      message: "Phone number or password is incorrect.",
      values: { username: "0901234567" },
    });
    expect(saveSession).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/features/auth/actions/login`
Expected: FAIL, `./login.action` not found.

- [ ] **Step 3: Implement `src/features/auth/actions/login.action.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "../constants";
import { clientContextHeaders } from "../lib/client-context";
import { formStateFromError, readForm, validationError, type FormState } from "../lib/form-state";
import { safeRedirectPath } from "../lib/safe-redirect";
import { loginSchema } from "../schemas/auth.schema";
import { authService } from "../services/auth.service";
import { saveSession } from "../session/cookies";
import type { AuthSession } from "../types/auth.types";

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = readForm(formData, ["username", "password"]);
  const values = { username: input.username };

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, values);

  let session: AuthSession;
  try {
    session = await authService.login(parsed.data, { headers: await clientContextHeaders() });
  } catch (error) {
    return formStateFromError(error, { values, overrides: { 401: "Phone number or password is incorrect." } });
  }

  await saveSession(session);
  const next = safeRedirectPath(formData.get("next"), AUTH_ROUTES.account);
  redirect(session.phoneVerified ? next : AUTH_ROUTES.verifyPhone);
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/features/auth/actions/login`
Expected: PASS.

- [ ] **Step 5: Create `src/features/auth/lib/use-field-errors.ts`**

```ts
"use client";

import { useState, type FocusEvent } from "react";
import { z } from "zod";
import type { FieldErrors } from "./form-state";

/**
 * Client-side, per-field validation on blur with the same zod schema the
 * Server Action uses. Server errors show until the user edits that field.
 * A new server response (new `serverErrors` object) resets the client state.
 */
export function useFieldErrors(schema: z.ZodType, serverErrors?: FieldErrors) {
  const [client, setClient] = useState<{ source?: FieldErrors; errors: Record<string, string | undefined> }>({
    source: serverErrors,
    errors: {},
  });
  const current = client.source === serverErrors ? client.errors : {};

  function onBlur(event: FocusEvent<HTMLFormElement>) {
    const field = event.target as HTMLInputElement;
    if (!field.name || field.type === "hidden" || field.type === "submit") return;
    const values = Object.fromEntries(
      [...new FormData(event.currentTarget).entries()].map(([key, value]) => [key, String(value)]),
    );
    const result = schema.safeParse(values);
    const message = result.success
      ? undefined
      : (z.flattenError(result.error).fieldErrors as FieldErrors)[field.name]?.[0];
    setClient({ source: serverErrors, errors: { ...current, [field.name]: message } });
  }

  function errorFor(name: string) {
    return name in current ? current[name] : serverErrors?.[name]?.[0];
  }

  return { onBlur, errorFor };
}
```

- [ ] **Step 6: Create `src/features/auth/components/login-form.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { loginAction } from "../actions/login.action";
import { AUTH_ROUTES } from "../constants";
import { initialFormState } from "../lib/form-state";
import { useFieldErrors } from "../lib/use-field-errors";
import { loginSchema } from "../schemas/auth.schema";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(loginSchema, state.fieldErrors);
  const phoneError = errorFor("username");
  const passwordError = errorFor("password");

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}

      <FormField id="username" label="Phone number" error={phoneError}>
        <Input
          id="username"
          name="username"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0901 234 567"
          required
          defaultValue={state.values?.username}
          invalid={Boolean(phoneError)}
          aria-describedby={describedBy("username", phoneError)}
        />
      </FormField>

      <FormField
        id="password"
        label="Password"
        error={passwordError}
        labelAction={
          <Link href={AUTH_ROUTES.forgotPassword} className="text-sm font-medium text-violet-700 hover:text-violet-800">
            Forgot password?
          </Link>
        }
      >
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          invalid={Boolean(passwordError)}
          aria-describedby={describedBy("password", passwordError)}
        />
      </FormField>

      <SubmitButton>Log in</SubmitButton>
    </form>
  );
}
```

- [ ] **Step 7: Create `src/features/auth/components/auth-notice.tsx`**

```tsx
import { Alert } from "@/components/ui/alert";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** One-off messages carried in the URL by redirects (`?reset=success`, `?session=expired`). */
export async function AuthNotice({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  if (params.reset === "success") {
    return <Alert tone="success">Your password has been reset. Log in with your new password.</Alert>;
  }
  if (params.session === "expired") {
    return <Alert tone="info">Your session has ended. Please log in again.</Alert>;
  }
  return null;
}
```

- [ ] **Step 8: Export from `src/features/auth/index.ts`** (add lines)

```ts
export { AuthNotice } from "./components/auth-notice";
export { LoginForm } from "./components/login-form";
export { safeRedirectPath } from "./lib/safe-redirect";
```

- [ ] **Step 9: Create `src/app/(auth)/login/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AUTH_ROUTES, AuthHeader, AuthNotice, FormSkeleton, LoginForm, safeRedirectPath } from "@/features/auth";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <AuthHeader title="Welcome back" description="Log in with your phone number to manage your rentals." />
      <Suspense fallback={<FormSkeleton fields={2} />}>
        <LoginSection searchParams={searchParams} />
      </Suspense>
      <p className="mt-8 text-center text-sm text-slate-600">
        New to Sunvibe?{" "}
        <Link href={AUTH_ROUTES.signUp} className="font-semibold text-violet-700 hover:text-violet-800">
          Create an account
        </Link>
      </p>
    </>
  );
}

async function LoginSection({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  const safeNext = safeRedirectPath(next, "");
  return (
    <div className="space-y-5">
      <AuthNotice searchParams={searchParams} />
      <LoginForm next={safeNext || undefined} />
    </div>
  );
}
```

- [ ] **Step 10: Verify, build and check manually**

Run: `npm test && npm run lint && npm run build && npx tsc --noEmit`
Expected: all pass, and the build lists `/login`.

Manual check (needs `sunvibe-server` on `:8082`): `npm run dev`, open http://localhost:3000/login.
- A wrong password shows "Phone number or password is incorrect." and keeps the phone number.
- Blurring an empty phone field shows the phone error.
- A valid login redirects to `/verify-phone` (unverified account) or `/account` (verified; that page arrives in Task 12, so a 404 is expected until then).

- [ ] **Step 11: Commit**

```bash
git add src/features/auth "src/app/(auth)/login"
git commit -m "feat(auth): add login page"
```

---

### Task 9: Sign-up

**Files:**
- Create: `src/features/auth/actions/register.action.ts` + `register.action.test.ts`
- Create: `src/features/auth/components/password-checklist.tsx`, `sign-up-form.tsx`
- Create: `src/app/(auth)/sign-up/page.tsx`
- Modify: `src/features/auth/index.ts`

**Interfaces:**
- Consumes: `registerSchema`, `PASSWORD_RULES`, `authService.register`, `saveSession`, form-state helpers, `useFieldErrors`, UI primitives.
- Produces: `registerAction(prev, formData): Promise<FormState>`, `PasswordChecklist({ value })`, `SignUpForm()`.

- [ ] **Step 1: Write the failing test `src/features/auth/actions/register.action.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { saveSession } from "../session/cookies";
import { registerAction } from "./register.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({ authService: { register: vi.fn() } }));
vi.mock("../session/cookies", () => ({ saveSession: vi.fn() }));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({})) }));

const register = vi.mocked(authService.register);
const valid = {
  fullName: "Nguyen Van An",
  username: "090 123 4567",
  email: "",
  idCardNumber: "",
  password: "Sunvibe@2026",
  confirmPassword: "Sunvibe@2026",
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => vi.clearAllMocks());

describe("registerAction", () => {
  it("never echoes passwords back", async () => {
    const state = await registerAction(initialFormState, form({ ...valid, confirmPassword: "Other@2026" }));
    expect(state.fieldErrors?.confirmPassword).toEqual(["Passwords do not match."]);
    expect(state.values).toEqual({ fullName: "Nguyen Van An", username: "090 123 4567", email: "", idCardNumber: "" });
  });

  it("sends normalized data, saves the session and goes to phone verification", async () => {
    const session = { accessToken: "a", refreshToken: "r", expiresIn: 900, phoneVerified: false };
    register.mockResolvedValue(session);

    await expect(registerAction(initialFormState, form(valid))).rejects.toThrow("NEXT_REDIRECT:/verify-phone");
    expect(register).toHaveBeenCalledWith({ ...valid, username: "0901234567" }, { headers: {} });
    expect(saveSession).toHaveBeenCalledWith(session);
  });

  it("shows the backend's duplicate-phone error on the phone field", async () => {
    register.mockRejectedValue(
      new ApiError(409, "Validation failed", { errors: [{ field: "username", message: "Phone number already in use." }] }),
    );
    const state = await registerAction(initialFormState, form(valid));
    expect(state.fieldErrors).toEqual({ username: ["Phone number already in use."] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/features/auth/actions/register`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/features/auth/actions/register.action.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "../constants";
import { clientContextHeaders } from "../lib/client-context";
import { formStateFromError, readForm, validationError, type FormState } from "../lib/form-state";
import { registerSchema } from "../schemas/auth.schema";
import { authService } from "../services/auth.service";
import { saveSession } from "../session/cookies";
import type { AuthSession } from "../types/auth.types";

export async function registerAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = readForm(formData, ["fullName", "username", "email", "idCardNumber", "password", "confirmPassword"]);
  const values = {
    fullName: input.fullName,
    username: input.username,
    email: input.email,
    idCardNumber: input.idCardNumber,
  };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, values);

  let session: AuthSession;
  try {
    session = await authService.register(parsed.data, { headers: await clientContextHeaders() });
  } catch (error) {
    return formStateFromError(error, { values });
  }

  await saveSession(session);
  redirect(AUTH_ROUTES.verifyPhone);
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/features/auth/actions/register`
Expected: PASS.

- [ ] **Step 5: Create `src/features/auth/components/password-checklist.tsx`**

```tsx
import { CheckIcon, CircleIcon } from "@/components/icons";
import { PASSWORD_RULES } from "../schemas/auth.schema";

/** Live list of the password rules; ticks each rule the current value meets. */
export function PasswordChecklist({ id, value }: { id: string; value: string }) {
  return (
    <ul id={id} className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li key={rule.id} className={`flex items-center gap-1.5 ${met ? "text-emerald-700" : "text-slate-500"}`}>
            {met ? <CheckIcon size={14} strokeWidth={3} /> : <CircleIcon size={14} />}
            <span>
              {rule.label}
              <span className="sr-only">{met ? " (met)" : " (not met)"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 6: Create `src/features/auth/components/sign-up-form.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { registerAction } from "../actions/register.action";
import { initialFormState } from "../lib/form-state";
import { useFieldErrors } from "../lib/use-field-errors";
import { registerSchema } from "../schemas/auth.schema";
import { PasswordChecklist } from "./password-checklist";

export function SignUpForm() {
  const [state, formAction] = useActionState(registerAction, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(registerSchema, state.fieldErrors);
  const [password, setPassword] = useState("");
  const error = {
    fullName: errorFor("fullName"),
    username: errorFor("username"),
    email: errorFor("email"),
    idCardNumber: errorFor("idCardNumber"),
    password: errorFor("password"),
    confirmPassword: errorFor("confirmPassword"),
  };

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}

      <FormField id="fullName" label="Full name" error={error.fullName}>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          defaultValue={state.values?.fullName}
          invalid={Boolean(error.fullName)}
          aria-describedby={describedBy("fullName", error.fullName)}
        />
      </FormField>

      <FormField id="username" label="Phone number" error={error.username} hint="You'll log in with this number and verify it by SMS.">
        <Input
          id="username"
          name="username"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0901 234 567"
          required
          defaultValue={state.values?.username}
          invalid={Boolean(error.username)}
          aria-describedby={describedBy("username", error.username, true)}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField id="email" label="Email" optional error={error.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.values?.email}
            invalid={Boolean(error.email)}
            aria-describedby={describedBy("email", error.email)}
          />
        </FormField>
        <FormField id="idCardNumber" label="ID card (CMND/CCCD)" optional error={error.idCardNumber}>
          <Input
            id="idCardNumber"
            name="idCardNumber"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={state.values?.idCardNumber}
            invalid={Boolean(error.idCardNumber)}
            aria-describedby={describedBy("idCardNumber", error.idCardNumber)}
          />
        </FormField>
      </div>

      <FormField id="password" label="Password" error={error.password} hint={<PasswordChecklist id="password-rules" value={password} />}>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          invalid={Boolean(error.password)}
          aria-describedby={error.password ? "password-error" : "password-hint"}
        />
      </FormField>

      <FormField id="confirmPassword" label="Confirm password" error={error.confirmPassword}>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          invalid={Boolean(error.confirmPassword)}
          aria-describedby={describedBy("confirmPassword", error.confirmPassword)}
        />
      </FormField>

      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
```

- [ ] **Step 7: Export from `src/features/auth/index.ts`** (add line)

```ts
export { SignUpForm } from "./components/sign-up-form";
```

- [ ] **Step 8: Create `src/app/(auth)/sign-up/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { AUTH_ROUTES, AuthHeader, SignUpForm } from "@/features/auth";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <>
      <AuthHeader
        title="Create your account"
        description="Join Sunvibe to find, list and lease properties with AI doing the busywork."
      />
      <SignUpForm />
      <p className="mt-8 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href={AUTH_ROUTES.login} className="font-semibold text-violet-700 hover:text-violet-800">
          Log in
        </Link>
      </p>
    </>
  );
}
```

- [ ] **Step 9: Verify, build, check manually and commit**

Run: `npm test && npm run lint && npm run build && npx tsc --noEmit`

Manual check: on `/sign-up`, the password checklist ticks live as you type; an already-registered phone shows the backend's message under the phone field; a successful sign-up redirects to `/verify-phone`.
```bash
git add src/features/auth "src/app/(auth)/sign-up"
git commit -m "feat(auth): add sign-up page"
```

---

### Task 10: Phone verification

**Files:**
- Create: `src/features/auth/actions/verify-phone.action.ts` + `verify-phone.action.test.ts`
- Create: `src/features/auth/lib/use-countdown.ts`
- Create: `src/features/auth/components/verify-phone-form.tsx`, `verify-phone-section.tsx`
- Create: `src/app/(onboarding)/layout.tsx`, `src/app/(onboarding)/error.tsx`, `src/app/(onboarding)/verify-phone/page.tsx`
- Modify: `src/features/auth/index.ts`

**Interfaces:**
- Consumes:
  - `authService.sendPhoneCode`, `authService.confirmPhone`, `otpSchema`, `readSessionTokens`, `requireUser`, `expiredSessionUrl`, form-state helpers
  - `OtpInput`, `Button`, `SubmitButton`, `Alert`, `FormField`
- Produces:
  - `SendCodeState = FormState & { resendAvailableAt?: string }`
  - `sendPhoneCodeAction(): Promise<SendCodeState>`
  - `confirmPhoneAction(prev: FormState, formData: FormData): Promise<FormState>`
  - `useCountdown(until?: string): number | null`
  - `VerifyPhoneForm({ maskedPhone })`, `VerifyPhoneSection()`

- [ ] **Step 1: Write the failing test `src/features/auth/actions/verify-phone.action.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { readSessionTokens } from "../session/cookies";
import { confirmPhoneAction, sendPhoneCodeAction } from "./verify-phone.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({ authService: { sendPhoneCode: vi.fn(), confirmPhone: vi.fn() } }));
vi.mock("../session/cookies", () => ({ readSessionTokens: vi.fn() }));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({})) }));

const tokens = vi.mocked(readSessionTokens);
const send = vi.mocked(authService.sendPhoneCode);
const confirm = vi.mocked(authService.confirmPhone);

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  tokens.mockResolvedValue({ accessToken: "a", refreshToken: "r" });
});

describe("sendPhoneCodeAction", () => {
  it("reports where the code went and when it can be resent", async () => {
    send.mockResolvedValue({
      channel: "PHONE",
      sentTo: "*******567",
      expiresAt: "2026-10-10T10:05:00Z",
      resendAvailableAt: "2026-10-10T10:01:00Z",
    });
    const state = await sendPhoneCodeAction();
    expect(state).toEqual({
      status: "success",
      message: "We sent a 6-digit code to *******567.",
      resendAvailableAt: "2026-10-10T10:01:00Z",
    });
    expect(send).toHaveBeenCalledWith({ accessToken: "a", headers: {} });
  });

  it("starts the countdown from Retry-After when rate limited", async () => {
    send.mockRejectedValue(new ApiError(429, "Too many", undefined, 60));
    const state = await sendPhoneCodeAction();
    expect(state.status).toBe("error");
    expect(Date.parse(state.resendAvailableAt ?? "")).toBeGreaterThan(Date.now() + 50_000);
  });

  it("sends an expired session back to login", async () => {
    send.mockRejectedValue(new ApiError(401, "Unauthorized"));
    await expect(sendPhoneCodeAction()).rejects.toThrow(
      "NEXT_REDIRECT:/login?session=expired&next=%2Fverify-phone",
    );
  });
});

describe("confirmPhoneAction", () => {
  it("rejects a malformed code without calling the backend", async () => {
    const state = await confirmPhoneAction(initialFormState, form({ code: "12" }));
    expect(state.fieldErrors?.code).toEqual(["Enter the 6-digit code."]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("confirms and goes to the account page", async () => {
    await expect(confirmPhoneAction(initialFormState, form({ code: "123456" }))).rejects.toThrow(
      "NEXT_REDIRECT:/account?phone=verified",
    );
    expect(confirm).toHaveBeenCalledWith("123456", { accessToken: "a", headers: {} });
  });

  it("explains a wrong or expired code", async () => {
    confirm.mockRejectedValue(new ApiError(400, "Invalid code"));
    const state = await confirmPhoneAction(initialFormState, form({ code: "123456" }));
    expect(state.message).toBe("The code is incorrect or has expired.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/features/auth/actions/verify-phone`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/features/auth/actions/verify-phone.action.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { AUTH_ROUTES } from "../constants";
import { clientContextHeaders } from "../lib/client-context";
import { formStateFromError, readForm, validationError, type FormState } from "../lib/form-state";
import { otpSchema } from "../schemas/auth.schema";
import { authService } from "../services/auth.service";
import { readSessionTokens } from "../session/cookies";
import { expiredSessionUrl } from "../session/dal";

export type SendCodeState = FormState & { resendAvailableAt?: string };

async function authContext() {
  const { accessToken } = await readSessionTokens();
  if (!accessToken) redirect(expiredSessionUrl(AUTH_ROUTES.verifyPhone));
  return { accessToken, headers: await clientContextHeaders() };
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.isUnauthorized;
}

/** Takes no arguments: `useActionState` passes (state, formData), and neither is needed. */
export async function sendPhoneCodeAction(): Promise<SendCodeState> {
  const context = await authContext();
  try {
    const result = await authService.sendPhoneCode(context);
    return {
      status: "success",
      message: `We sent a 6-digit code to ${result.sentTo}.`,
      resendAvailableAt: result.resendAvailableAt,
    };
  } catch (error) {
    if (isUnauthorized(error)) redirect(expiredSessionUrl(AUTH_ROUTES.verifyPhone));
    const state: SendCodeState = formStateFromError(error);
    if (error instanceof ApiError && error.status === 429 && error.retryAfterSeconds) {
      state.resendAvailableAt = new Date(Date.now() + error.retryAfterSeconds * 1000).toISOString();
    }
    return state;
  }
}

export async function confirmPhoneAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = otpSchema.safeParse(readForm(formData, ["code"]));
  if (!parsed.success) return validationError(parsed.error);

  const context = await authContext();
  try {
    await authService.confirmPhone(parsed.data.code, context);
  } catch (error) {
    if (isUnauthorized(error)) redirect(expiredSessionUrl(AUTH_ROUTES.verifyPhone));
    return formStateFromError(error);
  }
  redirect(`${AUTH_ROUTES.account}?phone=verified`);
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/features/auth/actions/verify-phone`
Expected: PASS.

- [ ] **Step 5: Create `src/features/auth/lib/use-countdown.ts`**

```ts
"use client";

import { useEffect, useState } from "react";

/**
 * Whole seconds left until `until` (ISO time): 0 when there is no target or
 * it has passed, null until the first tick after a new target arrives.
 */
export function useCountdown(until?: string): number | null {
  const target = until ? Date.parse(until) : 0;
  const [now, setNow] = useState<{ target: number; time: number } | null>(null);

  useEffect(() => {
    if (!target) return;
    const tick = () => setNow({ target, time: Date.now() });
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [target]);

  if (!target) return 0;
  if (!now || now.target !== target) return null;
  return Math.max(0, Math.ceil((target - now.time) / 1000));
}
```

- [ ] **Step 6: Create `src/features/auth/components/verify-phone-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { OtpInput } from "@/components/ui/otp-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { confirmPhoneAction, sendPhoneCodeAction, type SendCodeState } from "../actions/verify-phone.action";
import { initialFormState } from "../lib/form-state";
import { useCountdown } from "../lib/use-countdown";

const initialSendState: SendCodeState = { status: "idle" };

function formatSeconds(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VerifyPhoneForm({ maskedPhone }: { maskedPhone: string }) {
  const [sendState, sendAction, sending] = useActionState(sendPhoneCodeAction, initialSendState);
  const [confirmState, confirmAction] = useActionState(confirmPhoneAction, initialFormState);
  const secondsLeft = useCountdown(sendState.resendAvailableAt);
  const codeSent = sendState.status === "success" || Boolean(sendState.resendAvailableAt);
  const codeError = confirmState.fieldErrors?.code?.[0];
  const waiting = secondsLeft === null || secondsLeft > 0;

  return (
    <div className="space-y-6">
      {sendState.message && <Alert tone={sendState.status === "error" ? "error" : "success"}>{sendState.message}</Alert>}

      {codeSent && (
        <form action={confirmAction} className="space-y-5">
          {confirmState.message && <Alert tone="error">{confirmState.message}</Alert>}
          <FormField id="code" label="Verification code" error={codeError}>
            <OtpInput
              id="code"
              name="code"
              label="Verification code"
              autoFocus
              invalid={Boolean(codeError)}
              describedBy={codeError ? "code-error" : undefined}
            />
          </FormField>
          <SubmitButton>Verify phone number</SubmitButton>
        </form>
      )}

      <form action={sendAction}>
        <Button
          type="submit"
          variant={codeSent ? "ghost" : "primary"}
          fullWidth
          pending={sending}
          disabled={codeSent && waiting}
        >
          {!codeSent
            ? `Send code to ${maskedPhone}`
            : waiting
              ? `Resend code${secondsLeft ? ` in ${formatSeconds(secondsLeft)}` : ""}`
              : "Resend code"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/features/auth/components/verify-phone-section.tsx`**

```tsx
import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "../constants";
import { requireUser } from "../session/dal";
import { VerifyPhoneForm } from "./verify-phone-form";

/** Reads the session, so render it inside <Suspense>. */
export async function VerifyPhoneSection() {
  const user = await requireUser(AUTH_ROUTES.verifyPhone);
  if (user.phoneVerified) redirect(AUTH_ROUTES.account);
  const maskedPhone = user.phoneNumber.replace(/\d(?=\d{3})/g, "•");
  return <VerifyPhoneForm maskedPhone={maskedPhone} />;
}
```

- [ ] **Step 8: Export from `src/features/auth/index.ts`** (add line)

```ts
export { VerifyPhoneSection } from "./components/verify-phone-section";
```

- [ ] **Step 9: Create the `(onboarding)` route files**

`src/app/(onboarding)/layout.tsx`:
```tsx
import { AuthShell } from "@/features/auth";

export default function OnboardingLayout({ children }: LayoutProps<"/">) {
  return <AuthShell>{children}</AuthShell>;
}
```

`src/app/(onboarding)/error.tsx`:
```tsx
"use client";

import { AuthError } from "@/features/auth/client";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <AuthError retry={retry} />;
}
```

`src/app/(onboarding)/verify-phone/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeader, FormSkeleton, VerifyPhoneSection } from "@/features/auth";

export const metadata: Metadata = { title: "Verify your phone" };

export default function VerifyPhonePage() {
  return (
    <>
      <AuthHeader
        title="Verify your phone number"
        description="We'll text you a 6-digit code. Your account stays pending until you confirm it."
      />
      <Suspense fallback={<FormSkeleton fields={1} />}>
        <VerifyPhoneSection />
      </Suspense>
    </>
  );
}
```

- [ ] **Step 10: Verify, build, check manually and commit**

Run: `npm test && npm run lint && npm run build && npx tsc --noEmit`

Manual check after signing up:
- "Send code" shows the masked destination and a countdown.
- The SMS code appears in the `sunvibe-server` log (`LoggingSmsSender`).
- Pasting `123 456` fills all boxes.
- A wrong code shows the error.
- The right code goes to `/account?phone=verified`. That page arrives in Task 12; a 404 is fine until then.
```bash
git add src/features/auth "src/app/(onboarding)"
git commit -m "feat(auth): add phone verification"
```

---

### Task 11: Forgot and reset password

**Files:**
- Create: `src/features/auth/actions/forgot-password.action.ts` + `forgot-password.action.test.ts`
- Create: `src/features/auth/actions/reset-password.action.ts` + `reset-password.action.test.ts`
- Create: `src/features/auth/components/forgot-password-form.tsx`, `reset-password-form.tsx`, `reset-password-section.tsx`
- Create: `src/app/(auth)/forgot-password/page.tsx`, `src/app/(auth)/reset-password/page.tsx`
- Modify: `src/features/auth/index.ts`

**Interfaces:**
- Consumes:
  - `forgotByEmailSchema`, `forgotBySmsSchema`, `resetPasswordSchema`
  - `authService.forgotPasswordByEmail/BySms/resetPassword`
  - `saveResetToken`, `readResetToken`, `clearResetToken`, `clearSession`
  - form-state helpers, `useFieldErrors`, `PasswordChecklist`, UI primitives
- Produces:
  - `forgotPasswordByEmailAction(prev, formData)`, `forgotPasswordBySmsAction(prev, formData)`, `resetPasswordAction(prev, formData)`
  - `ForgotPasswordForm()`, `ResetPasswordForm({ token?: string; via: "email" | "sms" })`, `ResetPasswordSection({ searchParams })`

- [ ] **Step 1: Write the failing tests**

`src/features/auth/actions/forgot-password.action.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { saveResetToken } from "../session/cookies";
import { forgotPasswordByEmailAction, forgotPasswordBySmsAction } from "./forgot-password.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({
  authService: { forgotPasswordByEmail: vi.fn(), forgotPasswordBySms: vi.fn() },
}));
vi.mock("../session/cookies", () => ({ saveResetToken: vi.fn() }));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({})) }));

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => vi.clearAllMocks());

describe("forgotPasswordByEmailAction", () => {
  it("answers the same way whether or not the account exists", async () => {
    vi.mocked(authService.forgotPasswordByEmail).mockResolvedValue({ message: "ok", otpExpirationMinutes: 5 });
    const state = await forgotPasswordByEmailAction(initialFormState, form({ email: "an@sunvibe.vn" }));
    expect(state.status).toBe("success");
    expect(state.message).toMatch(/^If an account uses this email/);
  });
});

describe("forgotPasswordBySmsAction", () => {
  it("keeps the reset token in a cookie and moves to the reset page", async () => {
    vi.mocked(authService.forgotPasswordBySms).mockResolvedValue({
      message: "ok",
      resetToken: "reset-1",
      otpExpirationMinutes: 5,
    });
    await expect(forgotPasswordBySmsAction(initialFormState, form({ phoneNumber: "0901234567" }))).rejects.toThrow(
      "NEXT_REDIRECT:/reset-password?via=sms",
    );
    expect(saveResetToken).toHaveBeenCalledWith("reset-1");
  });
});
```

`src/features/auth/actions/reset-password.action.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { initialFormState } from "../lib/form-state";
import { authService } from "../services/auth.service";
import { clearResetToken, clearSession, readResetToken } from "../session/cookies";
import { resetPasswordAction } from "./reset-password.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({ authService: { resetPassword: vi.fn() } }));
vi.mock("../session/cookies", () => ({
  readResetToken: vi.fn(),
  clearResetToken: vi.fn(),
  clearSession: vi.fn(),
}));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({})) }));

const fields = { otpCode: "123456", newPassword: "Sunvibe@2026", confirmPassword: "Sunvibe@2026" };

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readResetToken).mockResolvedValue(undefined);
});

describe("resetPasswordAction", () => {
  it("refuses when there is no token in the form or cookie", async () => {
    const state = await resetPasswordAction(initialFormState, form(fields));
    expect(state.message).toBe("This reset link is invalid or has expired. Request a new one.");
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it("uses the SMS token from the cookie, signs out and goes to login", async () => {
    vi.mocked(readResetToken).mockResolvedValue("reset-sms");
    await expect(resetPasswordAction(initialFormState, form(fields))).rejects.toThrow(
      "NEXT_REDIRECT:/login?reset=success",
    );
    expect(authService.resetPassword).toHaveBeenCalledWith({ ...fields, resetToken: "reset-sms" }, { headers: {} });
    expect(clearResetToken).toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalled();
  });

  it("prefers the e-mail link token from the form", async () => {
    vi.mocked(readResetToken).mockResolvedValue("reset-sms");
    await expect(resetPasswordAction(initialFormState, form({ ...fields, resetToken: "reset-mail" }))).rejects.toThrow();
    expect(authService.resetPassword).toHaveBeenCalledWith({ ...fields, resetToken: "reset-mail" }, { headers: {} });
  });

  it("explains a wrong code", async () => {
    vi.mocked(authService.resetPassword).mockRejectedValue(new ApiError(400, "Invalid OTP"));
    const state = await resetPasswordAction(initialFormState, form({ ...fields, resetToken: "t" }));
    expect(state.message).toBe("The code is incorrect or has expired.");
    expect(clearSession).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/features/auth/actions`
Expected: the new tests FAIL (modules not found); earlier ones pass.

- [ ] **Step 3: Implement `src/features/auth/actions/forgot-password.action.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "../constants";
import { clientContextHeaders } from "../lib/client-context";
import { formStateFromError, readForm, validationError, type FormState } from "../lib/form-state";
import { forgotByEmailSchema, forgotBySmsSchema } from "../schemas/auth.schema";
import { authService } from "../services/auth.service";
import { saveResetToken } from "../session/cookies";
import type { PasswordForgotResult } from "../types/auth.types";

export async function forgotPasswordByEmailAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = readForm(formData, ["email"]);
  const parsed = forgotByEmailSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, values);

  try {
    await authService.forgotPasswordByEmail(parsed.data.email, { headers: await clientContextHeaders() });
  } catch (error) {
    return formStateFromError(error, { values });
  }
  return {
    status: "success",
    message:
      "If an account uses this email, we've sent it a 6-digit code and a reset link. Open the link to choose a new password.",
    values,
  };
}

export async function forgotPasswordBySmsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = readForm(formData, ["phoneNumber"]);
  const parsed = forgotBySmsSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, values);

  let result: PasswordForgotResult;
  try {
    result = await authService.forgotPasswordBySms(parsed.data.phoneNumber, { headers: await clientContextHeaders() });
  } catch (error) {
    return formStateFromError(error, { values });
  }

  if (!result.resetToken) {
    return { status: "success", message: "If an account uses this phone number, we've sent it a 6-digit code.", values };
  }
  await saveResetToken(result.resetToken);
  redirect(`${AUTH_ROUTES.resetPassword}?via=sms`);
}
```

- [ ] **Step 4: Implement `src/features/auth/actions/reset-password.action.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "../constants";
import { clientContextHeaders } from "../lib/client-context";
import { formStateFromError, readForm, validationError, type FormState } from "../lib/form-state";
import { resetPasswordSchema } from "../schemas/auth.schema";
import { authService } from "../services/auth.service";
import { clearResetToken, clearSession, readResetToken } from "../session/cookies";

export async function resetPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = readForm(formData, ["resetToken", "otpCode", "newPassword", "confirmPassword"]);
  // E-mail flow: token from the link (hidden field). SMS flow: token from the sv_reset cookie.
  const resetToken = input.resetToken || (await readResetToken());
  if (!resetToken) {
    return { status: "error", message: "This reset link is invalid or has expired. Request a new one." };
  }

  const parsed = resetPasswordSchema.safeParse({ ...input, resetToken });
  if (!parsed.success) return validationError(parsed.error);

  try {
    await authService.resetPassword(parsed.data, { headers: await clientContextHeaders() });
  } catch (error) {
    return formStateFromError(error);
  }

  // The backend signed out every device; drop this browser's cookies too.
  await clearResetToken();
  await clearSession();
  redirect(`${AUTH_ROUTES.login}?reset=success`);
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/features/auth/actions`
Expected: PASS.

- [ ] **Step 6: Create `src/features/auth/components/forgot-password-form.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { forgotPasswordByEmailAction, forgotPasswordBySmsAction } from "../actions/forgot-password.action";
import { AUTH_ROUTES } from "../constants";
import { initialFormState } from "../lib/form-state";
import { useFieldErrors } from "../lib/use-field-errors";
import { forgotByEmailSchema, forgotBySmsSchema } from "../schemas/auth.schema";

type Channel = "email" | "sms";

const tabs: { id: Channel; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "sms", label: "Phone" },
];

export function ForgotPasswordForm() {
  const [channel, setChannel] = useState<Channel>("email");
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Reset method" className="grid grid-cols-2 rounded-full bg-slate-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={channel === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setChannel(tab.id)}
            className={`rounded-full py-2 text-sm font-semibold transition-colors ${
              channel === tab.id ? "bg-white text-navy-950 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div id={`panel-${channel}`} role="tabpanel" aria-labelledby={`tab-${channel}`}>
        {channel === "email" ? <EmailForm /> : <SmsForm />}
      </div>
    </div>
  );
}

function EmailForm() {
  const [state, formAction] = useActionState(forgotPasswordByEmailAction, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(forgotByEmailSchema, state.fieldErrors);
  const error = errorFor("email");

  if (state.status === "success") {
    return (
      <div className="space-y-5">
        <Alert tone="success" title="Check your inbox">
          {state.message}
        </Alert>
        <Link href={AUTH_ROUTES.login} className="block text-center text-sm font-semibold text-violet-700 hover:text-violet-800">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <FormField id="email" label="Email address" error={error}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          invalid={Boolean(error)}
          aria-describedby={describedBy("email", error)}
        />
      </FormField>
      <SubmitButton>Email me a reset link</SubmitButton>
    </form>
  );
}

function SmsForm() {
  const [state, formAction] = useActionState(forgotPasswordBySmsAction, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(forgotBySmsSchema, state.fieldErrors);
  const error = errorFor("phoneNumber");

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      {state.message && <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>}
      <FormField id="phoneNumber" label="Phone number" error={error}>
        <Input
          id="phoneNumber"
          name="phoneNumber"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0901 234 567"
          required
          defaultValue={state.values?.phoneNumber}
          invalid={Boolean(error)}
          aria-describedby={describedBy("phoneNumber", error)}
        />
      </FormField>
      <SubmitButton>Text me a code</SubmitButton>
    </form>
  );
}
```

- [ ] **Step 7: Create `src/features/auth/components/reset-password-form.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { OtpInput } from "@/components/ui/otp-input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { resetPasswordAction } from "../actions/reset-password.action";
import { initialFormState } from "../lib/form-state";
import { useFieldErrors } from "../lib/use-field-errors";
import { resetPasswordFieldsSchema } from "../schemas/auth.schema";
import { PasswordChecklist } from "./password-checklist";

export function ResetPasswordForm({ token, via }: { token?: string; via: "email" | "sms" }) {
  const [state, formAction] = useActionState(resetPasswordAction, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(resetPasswordFieldsSchema.omit({ resetToken: true }), state.fieldErrors);
  const [password, setPassword] = useState("");
  const codeError = state.fieldErrors?.otpCode?.[0];
  const passwordError = errorFor("newPassword");
  const confirmError = errorFor("confirmPassword");

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}
      {token && <input type="hidden" name="resetToken" value={token} />}

      <FormField
        id="otpCode"
        label={via === "sms" ? "Code from the SMS" : "Code from the email"}
        error={codeError}
      >
        <OtpInput
          id="otpCode"
          name="otpCode"
          label="Reset code"
          autoFocus
          invalid={Boolean(codeError)}
          describedBy={codeError ? "otpCode-error" : undefined}
        />
      </FormField>

      <FormField id="newPassword" label="New password" error={passwordError} hint={<PasswordChecklist id="new-password-rules" value={password} />}>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          invalid={Boolean(passwordError)}
          aria-describedby={passwordError ? "newPassword-error" : "newPassword-hint"}
        />
      </FormField>

      <FormField id="confirmPassword" label="Confirm new password" error={confirmError}>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          invalid={Boolean(confirmError)}
          aria-describedby={describedBy("confirmPassword", confirmError)}
        />
      </FormField>

      <SubmitButton>Set new password</SubmitButton>
    </form>
  );
}
```


- [ ] **Step 8: Create `src/features/auth/components/reset-password-section.tsx`**

```tsx
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { AUTH_ROUTES } from "../constants";
import { readResetToken } from "../session/cookies";
import { ResetPasswordForm } from "./reset-password-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Reads search params and cookies, so render it inside <Suspense>. */
export async function ResetPasswordSection({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = typeof params.token === "string" && params.token ? params.token : undefined;
  const via = params.via === "sms" ? "sms" : "email";

  if (!token && !(await readResetToken())) {
    return (
      <div className="space-y-5">
        <Alert tone="error" title="This link is invalid or has expired">
          Reset links and codes only work for a short time and only once.
        </Alert>
        <Link href={AUTH_ROUTES.forgotPassword} className="block text-center text-sm font-semibold text-violet-700 hover:text-violet-800">
          Request a new code
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} via={via} />;
}
```

- [ ] **Step 9: Export from `src/features/auth/index.ts`** (add lines)

```ts
export { ForgotPasswordForm } from "./components/forgot-password-form";
export { ResetPasswordSection } from "./components/reset-password-section";
```

- [ ] **Step 10: Create the pages**

`src/app/(auth)/forgot-password/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { AUTH_ROUTES, AuthHeader, ForgotPasswordForm } from "@/features/auth";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeader
        title="Forgot your password?"
        description="Choose how to receive a 6-digit code, then set a new password."
      />
      <ForgotPasswordForm />
      <p className="mt-8 text-center text-sm text-slate-600">
        Remembered it?{" "}
        <Link href={AUTH_ROUTES.login} className="font-semibold text-violet-700 hover:text-violet-800">
          Log in
        </Link>
      </p>
    </>
  );
}
```

`src/app/(auth)/reset-password/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeader, FormSkeleton, ResetPasswordSection } from "@/features/auth";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <>
      <AuthHeader
        title="Set a new password"
        description="Enter the code we sent you and choose a new password. You'll be signed out of every device."
      />
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <ResetPasswordSection searchParams={searchParams} />
      </Suspense>
    </>
  );
}
```

- [ ] **Step 11: Verify, build, check manually and commit**

Run: `npm test && npm run lint && npm run build && npx tsc --noEmit`

Manual checks:
- **SMS flow:** `/forgot-password` → Phone tab → submit. You land on `/reset-password?via=sms`, and the code is in the backend log. Reset, and you land on `/login?reset=success` with the success banner.
- **E-mail flow:** the backend's link points to `yourapp.com` (spec §8). Copy its `token` value into `http://localhost:3000/reset-password?token=<value>` to test it.
- `/reset-password` with no token and no cookie shows the invalid-link state.
```bash
git add src/features/auth "src/app/(auth)/forgot-password" "src/app/(auth)/reset-password"
git commit -m "feat(auth): add forgot and reset password"
```

---

### Task 12: Logout, account page and session-aware header

**Files:**
- Create: `src/features/auth/actions/logout.action.ts` + `logout.action.test.ts`
- Create: `src/features/auth/components/logout-button.tsx`, `account-overview.tsx`, `user-menu.tsx`
- Create: `src/components/layout/site-shell.tsx`
- Modify: `src/components/layout/site-header.tsx` (accept `actions`)
- Modify: `src/app/(marketing)/layout.tsx`
- Create: `src/app/(platform)/layout.tsx`, `src/app/(platform)/error.tsx`, `src/app/(platform)/account/page.tsx`
- Modify: `src/features/auth/index.ts`

**Interfaces:**
- Consumes: `readSessionTokens`, `clearSession`, `authService.logout`, `requireUser`, `hasSession`, `AUTH_ROUTES`, UI primitives and icons.
- Produces: `logoutAction(): Promise<void>`, `LogoutButton()`, `AccountOverview({ searchParams })`, `UserMenu()`, `SiteShell({ headerActions?, children })`, `SiteHeader({ actions? })`.

- [ ] **Step 1: Write the failing test `src/features/auth/actions/logout.action.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authService } from "../services/auth.service";
import { clearSession, readSessionTokens } from "../session/cookies";
import { logoutAction } from "./logout.action";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("../services/auth.service", () => ({ authService: { logout: vi.fn() } }));
vi.mock("../session/cookies", () => ({ readSessionTokens: vi.fn(), clearSession: vi.fn() }));
vi.mock("../lib/client-context", () => ({ clientContextHeaders: vi.fn(async () => ({})) }));

beforeEach(() => vi.clearAllMocks());

describe("logoutAction", () => {
  it("revokes the refresh token, clears cookies and goes home", async () => {
    vi.mocked(readSessionTokens).mockResolvedValue({ accessToken: "a", refreshToken: "r" });
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(authService.logout).toHaveBeenCalledWith("r", { headers: {} });
    expect(clearSession).toHaveBeenCalled();
  });

  it("still signs out locally when the backend is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(readSessionTokens).mockResolvedValue({ refreshToken: "r" });
    vi.mocked(authService.logout).mockRejectedValue(new TypeError("fetch failed"));
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(clearSession).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/features/auth/actions/logout`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/features/auth/actions/logout.action.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { clientContextHeaders } from "../lib/client-context";
import { authService } from "../services/auth.service";
import { clearSession, readSessionTokens } from "../session/cookies";

export async function logoutAction(): Promise<void> {
  const { refreshToken } = await readSessionTokens();
  if (refreshToken) {
    try {
      await authService.logout(refreshToken, { headers: await clientContextHeaders() });
    } catch (error) {
      // Signing out locally must never depend on the backend being up.
      console.error("[auth] Backend logout failed:", error instanceof Error ? error.message : error);
    }
  }
  await clearSession();
  redirect("/");
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/features/auth/actions/logout`
Expected: PASS.

- [ ] **Step 5: Create `src/features/auth/components/logout-button.tsx`**

```tsx
import { LogOutIcon } from "@/components/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { logoutAction } from "../actions/logout.action";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <SubmitButton variant="secondary" fullWidth={false}>
        <LogOutIcon size={16} />
        Log out
      </SubmitButton>
    </form>
  );
}
```

- [ ] **Step 6: Create `src/features/auth/components/account-overview.tsx`**

```tsx
import Link from "next/link";
import { CheckIcon, ShieldCheckIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { AUTH_ROUTES } from "../constants";
import { requireUser } from "../session/dal";
import { LogoutButton } from "./logout-button";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const statusLabels: Record<string, string> = {
  PENDING: "Pending phone verification",
  ACTIVE: "Active",
};

/** Reads the session and search params, so render it inside <Suspense>. */
export async function AccountOverview({ searchParams }: { searchParams: SearchParams }) {
  const [user, params] = await Promise.all([requireUser(AUTH_ROUTES.account), searchParams]);
  const status = statusLabels[user.accountStatus] ?? user.accountStatus.toLowerCase();

  return (
    <div className="space-y-6">
      {params.phone === "verified" && (
        <Alert tone="success">Your phone number is verified. Welcome to Sunvibe!</Alert>
      )}
      {!user.phoneVerified && (
        <Alert tone="info" title="Verify your phone number">
          Your account stays pending until you confirm your phone.{" "}
          <Link href={AUTH_ROUTES.verifyPhone} className="font-semibold underline underline-offset-2">
            Verify now
          </Link>
        </Alert>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xl font-semibold text-white">
              {user.fullName.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-navy-950">{user.fullName}</h1>
              <p className="text-sm text-slate-500">{status}</p>
            </div>
          </div>
          <LogoutButton />
        </div>

        <dl className="mt-8 grid grid-cols-1 gap-6 border-t border-slate-100 pt-6 sm:grid-cols-2">
          <Detail label="Phone number" value={user.phoneNumber} verified={user.phoneVerified} />
          <Detail
            label="Email"
            value={user.email ?? "Not provided"}
            verified={user.email ? user.emailVerified : undefined}
          />
        </dl>
      </section>

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheckIcon size={14} />
        Your session is protected and renews automatically while you use Sunvibe.
      </p>
    </div>
  );
}

function Detail({ label, value, verified }: { label: string; value: string; verified?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
        {value}
        {verified !== undefined && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
              verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {verified && <CheckIcon size={12} strokeWidth={3} />}
            {verified ? "Verified" : "Not verified"}
          </span>
        )}
      </dd>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/features/auth/components/user-menu.tsx`**

```tsx
import Link from "next/link";
import { Suspense } from "react";
import { UserIcon } from "@/components/icons";
import { AUTH_ROUTES } from "../constants";
import { hasSession } from "../session/dal";

const linkClass = "inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 transition-colors hover:text-violet-700";

/** "Log in" or "Account" in the site header. Reads cookies only, so it never calls the backend. */
export function UserMenu() {
  return (
    <Suspense fallback={<span aria-hidden className="inline-block h-4 w-14 animate-pulse rounded bg-slate-100" />}>
      <UserMenuLink />
    </Suspense>
  );
}

async function UserMenuLink() {
  return (await hasSession()) ? (
    <Link href={AUTH_ROUTES.account} className={linkClass}>
      <UserIcon size={16} />
      Account
    </Link>
  ) : (
    <Link href={AUTH_ROUTES.login} className={linkClass}>
      Log in
    </Link>
  );
}
```

- [ ] **Step 8: Export from `src/features/auth/index.ts`** (add lines)

```ts
export { AccountOverview } from "./components/account-overview";
export { LogoutButton } from "./components/logout-button";
export { UserMenu } from "./components/user-menu";
export { getSessionUser, hasSession, requireUser } from "./session/dal";
export type { SessionUser } from "./session/dal";
```

- [ ] **Step 9: Let the site header take actions, and add `SiteShell`**

In `src/components/layout/site-header.tsx`:
- Change the signature to `export function SiteHeader({ actions }: { actions?: ReactNode }) {` and add `import type { ReactNode } from "react";`.
- Render `{actions}` right before the "Get early access" link.
- Change that link's className to start with `hidden sm:inline-block`, so the mobile header fits the logo, "Log in" and nothing else:
```tsx
            className="hidden rounded-full bg-navy-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-navy-800 sm:inline-block"
```

Create `src/components/layout/site-shell.tsx`:
```tsx
import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** Header, main and footer of the public site. `headerActions` lets features add header items. */
export function SiteShell({ headerActions, children }: { headerActions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <SiteHeader actions={headerActions} />
      <main id="top" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
```

Replace `src/app/(marketing)/layout.tsx`:
```tsx
import { SiteShell } from "@/components/layout/site-shell";
import { UserMenu } from "@/features/auth";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return <SiteShell headerActions={<UserMenu />}>{children}</SiteShell>;
}
```

- [ ] **Step 10: Create the `(platform)` route files**

`src/app/(platform)/layout.tsx`:
```tsx
import { SiteShell } from "@/components/layout/site-shell";
import { UserMenu } from "@/features/auth";

export default function PlatformLayout({ children }: LayoutProps<"/">) {
  return <SiteShell headerActions={<UserMenu />}>{children}</SiteShell>;
}
```

`src/app/(platform)/error.tsx`:
```tsx
"use client";

import { AuthError } from "@/features/auth/client";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <AuthError retry={retry} />
    </div>
  );
}
```

`src/app/(platform)/account/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountOverview, FormSkeleton } from "@/features/auth";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <Suspense fallback={<FormSkeleton fields={2} />}>
        <AccountOverview searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 11: Verify, build, check manually and commit**

Run: `npm test && npm run lint && npm run build && npx tsc --noEmit`
Expected:
- all pass;
- the build lists `/account`;
- `/` is still prerendered with a dynamic hole for the user menu (shown as `◐`/partial prerender, or `○` with PPR).

Manual checks:
- **Signed out:** the header shows "Log in", and `/account` redirects to `/login?next=%2Faccount`.
- **After login:** the header shows "Account"; `/account` shows the name, phone and badges; "Log out" goes to `/` and the header shows "Log in" again.
- **Silent refresh:** in DevTools, delete only the `sv_at` cookie and reload `/account`. The page still loads and a new `sv_at` appears.
```bash
git add src/features/auth src/components/layout "src/app/(marketing)/layout.tsx" "src/app/(platform)"
git commit -m "feat(auth): add account page, logout and session-aware header"
```

---

### Task 13: Remove legacy files, document, final verification

**Files:**
- Delete: `src/features/auth/Login.jsx`, `SignUp.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `authen.css` (if not already removed in Task 3)
- Modify: `README.md`

- [ ] **Step 1: Delete the legacy files**

```bash
rm -f src/features/auth/Login.jsx src/features/auth/SignUp.jsx src/features/auth/ForgotPassword.jsx src/features/auth/ResetPassword.jsx src/features/auth/authen.css
```
(They were never committed, and the originals remain in `D:\Projects\business-app\business-ui`.)

- [ ] **Step 2: Update `README.md`**

- In the commands table, add `| \`npm test\` | Run unit tests (Vitest) |`.
- Replace the environment table rows for `AUTH_SERVICE_URL` and `PROPERTY_SERVICE_URL` with:
```markdown
| `API_BASE_URL`         | Server only     | Base URL of sunvibe-server (default `http://localhost:8082` in development) |
```
- In the project structure, add under `app/`:
```
│   ├── (auth)/             # /login, /sign-up, /forgot-password, /reset-password
│   ├── (onboarding)/       # /verify-phone (signed in, phone not verified)
│   ├── (platform)/         # /account and future signed-in pages
```
  and `├── proxy.ts               # Silent token refresh + optimistic route guards` directly under `src/`.
- Add a section after "Conventions":
```markdown
## Authentication

The browser never talks to sunvibe-server directly. Server Actions call auth-service and keep the tokens in HttpOnly cookies on this site (`sv_at` for the access token, `sv_rt` for the refresh token, both prefixed `__Host-` in production). `src/proxy.ts` refreshes an expired access token before the page renders and redirects signed-out visitors away from protected pages. Pages authorize with `requireUser()` from `@/features/auth`, rendered inside `<Suspense>` because `cacheComponents` is on.

Entry points: `@/features/auth` for pages and layouts, `@/features/auth/client` for Client Components, `@/features/auth/proxy` for `src/proxy.ts` only.

Backend requirements before production: see "Backend changes" in `docs/superpowers/specs/2026-10-10-auth-feature-design.md` (real client IP forwarding, reset-link domain).
```
- Replace the sentence "The endpoint paths and DTOs in `auth` and `property` are a starting contract. Align them with the real services before use." with "The endpoint paths and DTOs in `property` are a starting contract; align them with property-service before use. `auth` follows the real auth-service contract."

- [ ] **Step 3: Full verification**

Run:
```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```
Expected: all pass. Then confirm:
- no remaining reference to the old env names: `grep -rn "AUTH_SERVICE_URL\|PROPERTY_SERVICE_URL" src README.md .env.example` prints nothing;
- no token logging: `grep -rn "console\.\(log\|error\)" src/features/auth` shows only the three error logs in `form-state.ts`, `refresh.ts` and `logout.action.ts`, and none prints a token, password or code.

- [ ] **Step 4: End-to-end run against sunvibe-server**

With `sunvibe-server` on `:8082` and `npm run dev`, check every step in order and tick each one off:
1. `/sign-up` with a new phone → `/verify-phone`.
2. Send code; the code is in the server log → `/account?phone=verified`, with the success banner and "Verified" badge.
3. Log out → `/`, header shows "Log in".
4. `/login` with a wrong password → error message, phone kept.
5. `/login` correct → `/account`.
6. Delete `sv_at` in DevTools and reload `/account` → still signed in, new `sv_at` set.
7. Log out. `/forgot-password` → Phone tab → `/reset-password?via=sms`. Enter the code from the log and a new password → `/login?reset=success`. Log in with the new password works.
8. Visit `/account` signed out → `/login?next=%2Faccount`. Log in → back on `/account`.

- [ ] **Step 5: Commit**

```bash
git add README.md src/features/auth
git commit -m "docs(auth): document the auth architecture and remove legacy screens"
```
