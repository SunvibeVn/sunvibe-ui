import createClient from "openapi-fetch";

import type { paths } from "@/api/generated/schema";
import { publicEnv } from "@/config/public-env";

import type { FieldError } from "./api-error";

// Browser-safe: no server-only code. Anonymous calls to /api/v1/public/** (ADR-001, ADR-008).

export const PUBLIC_API_TIMEOUT_MS = 15_000;

export type PublicApiSuccess<T> = {
  ok: true;
  data: T;
  status: number;
  /** True when the server answered with `Idempotent-Replayed: true`. */
  replayed: boolean;
  correlationId?: string;
};

export type PublicApiHttpError = {
  ok: false;
  kind: "http";
  status: number;
  /** Stable error code (ADR-010); switch on it, never on the message. */
  code?: string;
  fieldErrors: FieldError[];
  correlationId?: string;
  retryAfterSeconds?: number;
};

export type PublicApiNetworkError = { ok: false; kind: "network" };

export type PublicApiResult<T> = PublicApiSuccess<T> | PublicApiHttpError | PublicApiNetworkError;

export type PublicClientOptions = {
  baseUrl?: string;
  /** Injectable for tests. */
  fetch?: (request: Request) => Promise<Response>;
  timeoutMs?: number;
};

/** Statuses whose response never has a body (Fetch standard "null body status"). */
const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([101, 103, 204, 205, 304]);

const abortError = (): DOMException => new DOMException("The request timed out or was aborted.", "AbortError");

/** One read of `reader` that rejects as soon as `signal` aborts, even when the underlying stream ignores the abort. */
function readUntilAborted(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Wraps a fetch function so each request is aborted after `timeoutMs` (and still follows the caller's own signal).
 * The deadline covers reading the body too: a body still streaming at the deadline fails like the request. An aborted
 * request rejects, which `toPublicResult` maps to `kind: "network"`.
 */
export function withTimeout(
  baseFetch: (request: Request) => Promise<Response>,
  timeoutMs: number,
): (request: Request) => Promise<Response> {
  return async (request) => {
    // Manual AbortController: AbortSignal.any/timeout are missing in older browsers.
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (request.signal.aborted) abort();
    else request.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
    };
    let response: Response;
    try {
      response = await baseFetch(new Request(request, { signal: controller.signal }));
    } catch (error) {
      release();
      throw error;
    }
    // No body to wait for: none at all, or a null body status (101, 103, 204, 205, 304), which Chromium still gives an
    // empty stream that a new Response may not carry.
    if (response.body === null || NULL_BODY_STATUSES.has(response.status)) {
      release();
      return response;
    }
    // The timer is released when the body ends, fails or is cancelled; until then the deadline still applies.
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(stream) {
        try {
          const { done, value } = await readUntilAborted(reader, controller.signal);
          if (done) {
            release();
            stream.close();
          } else {
            stream.enqueue(value);
          }
        } catch (error) {
          release();
          reader.cancel().catch(() => undefined);
          stream.error(error);
        }
      },
      cancel(reason) {
        release();
        return reader.cancel(reason);
      },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

export function createPublicClient(options: PublicClientOptions = {}) {
  const baseFetch = options.fetch ?? ((request: Request) => globalThis.fetch(request));
  return createClient<paths>({
    baseUrl: options.baseUrl ?? publicEnv.apiUrl,
    credentials: "omit",
    fetch: withTimeout(baseFetch, options.timeoutMs ?? PUBLIC_API_TIMEOUT_MS),
  });
}

/** What an openapi-fetch call resolves to, as `toPublicResult` and `callApi` read it. */
export type ClientResponse<T> = { data?: T; error?: unknown; response: Response };

function parseFieldErrors(body: unknown): FieldError[] {
  if (!body || typeof body !== "object" || !("errors" in body) || !Array.isArray(body.errors)) return [];
  return body.errors.flatMap((entry: unknown): FieldError[] => {
    if (!entry || typeof entry !== "object") return [];
    const { field, message, allowedValues } = entry as Record<string, unknown>;
    if (typeof field !== "string" || typeof message !== "string") return [];
    const allowed = Array.isArray(allowedValues)
      ? allowedValues.filter((value): value is string => typeof value === "string")
      : undefined;
    return [allowed ? { field, message, allowedValues: allowed } : { field, message }];
  });
}

/** Awaits an openapi-fetch call and maps it to a discriminated union; never throws. */
export async function toPublicResult<T>(call: Promise<ClientResponse<T>>): Promise<PublicApiResult<T>> {
  let result: ClientResponse<T>;
  try {
    result = await call;
  } catch {
    return { ok: false, kind: "network" };
  }
  const { response } = result;
  const headerId = response.headers.get("X-Correlation-Id") ?? undefined;

  if (response.ok) {
    return {
      ok: true,
      data: result.data as T,
      status: response.status,
      replayed: response.headers.get("Idempotent-Replayed") === "true",
      correlationId: headerId,
    };
  }

  const body = result.error;
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const retryAfterHeader = response.headers.get("Retry-After");
  const retryAfter = retryAfterHeader === null ? NaN : Number(retryAfterHeader);
  return {
    ok: false,
    kind: "http",
    status: response.status,
    code: typeof record.code === "string" ? record.code : undefined,
    fieldErrors: parseFieldErrors(body),
    correlationId: typeof record.correlationId === "string" ? record.correlationId : headerId,
    retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined,
  };
}
