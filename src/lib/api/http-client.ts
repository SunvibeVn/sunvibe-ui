import { ApiError } from "./api-error";

type QueryValue = string | number | boolean | null | undefined;

export type RequestOptions = Omit<RequestInit, "method" | "body"> & {
  body?: unknown;
  query?: Record<string, QueryValue>;
  accessToken?: string;
};

type HttpClientConfig = {
  /** Resolved per request so a missing env var only fails the calls that need it. */
  baseUrl: () => string;
  defaultHeaders?: HeadersInit;
};

export type HttpClient = ReturnType<typeof createHttpClient>;

/**
 * Thin, typed wrapper over `fetch`, one instance per backend service
 * (auth-service, property-service, ...). Caching is left to the caller:
 * pass `next`/`cache` options or wrap the call in `"use cache"`.
 */
export function createHttpClient({ baseUrl, defaultHeaders }: HttpClientConfig) {
  async function request<T>(
    method: string,
    path: string,
    { body, query, accessToken, headers, ...init }: RequestOptions = {},
  ): Promise<T> {
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
    new Headers(headers).forEach((value, key) => requestHeaders.set(key, value));

    const response = await fetch(url, {
      ...init,
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await parseBody(response);
    if (!response.ok) {
      throw new ApiError(response.status, errorMessage(payload, response), payload);
    }
    return payload as T;
  }

  return {
    get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>("POST", path, { ...options, body }),
    put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>("PUT", path, { ...options, body }),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>("PATCH", path, { ...options, body }),
    delete: <T>(path: string, options?: RequestOptions) =>
      request<T>("DELETE", path, options),
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
