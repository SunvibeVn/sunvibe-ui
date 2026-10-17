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

export function createPublicClient(options: PublicClientOptions = {}) {
  const baseFetch = options.fetch ?? ((request: Request) => globalThis.fetch(request));
  const timeoutMs = options.timeoutMs ?? PUBLIC_API_TIMEOUT_MS;
  return createClient<paths>({
    baseUrl: options.baseUrl ?? publicEnv.apiUrl,
    credentials: "omit",
    fetch: (request) =>
      baseFetch(
        new Request(request, {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
        }),
      ),
  });
}

type ClientResponse<T> = { data?: T; error?: unknown; response: Response };

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
