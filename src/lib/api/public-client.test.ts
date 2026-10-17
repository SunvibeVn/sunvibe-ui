import { afterEach, describe, expect, it, vi } from "vitest";

import { createPublicClient, toPublicResult } from "./public-client";

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function setup(respond: (request: Request) => Promise<Response> | Response, timeoutMs?: number) {
  const requests: Request[] = [];
  const client = createPublicClient({
    baseUrl: "http://api.test",
    timeoutMs,
    fetch: async (request) => {
      requests.push(request);
      return respond(request);
    },
  });
  return { client, requests };
}

const submit = (client: ReturnType<typeof createPublicClient>) =>
  toPublicResult(client.POST("/api/v1/public/owner-intake-requests", { body: {} as never }));

describe("public client", () => {
  it("maps 202 to success and sends credentials omit", async () => {
    const { client, requests } = setup(() =>
      json(202, { requestId: "r1" }, { "X-Correlation-Id": "corr-12345678" }),
    );
    const result = await submit(client);
    expect(result).toMatchObject({ ok: true, status: 202, replayed: false, correlationId: "corr-12345678" });
    expect(result.ok && result.data).toEqual({ requestId: "r1" });
    expect(requests[0].credentials).toBe("omit");
    expect(requests[0].url).toBe("http://api.test/api/v1/public/owner-intake-requests");
  });

  it("flags an idempotent replay", async () => {
    const { client } = setup(() => json(202, {}, { "Idempotent-Replayed": "true" }));
    expect(await submit(client)).toMatchObject({ ok: true, replayed: true });
  });

  it("maps 400 with field errors", async () => {
    const { client } = setup(() =>
      json(400, {
        code: "VALIDATION_FAILED",
        message: "x",
        errors: [
          { field: "phone", message: "bad" },
          { field: 3 },
          { field: "intent", message: "m", allowedValues: ["A"] },
        ],
        correlationId: "body-1234567",
      }),
    );
    expect(await submit(client)).toEqual({
      ok: false,
      kind: "http",
      status: 400,
      code: "VALIDATION_FAILED",
      fieldErrors: [
        { field: "phone", message: "bad" },
        { field: "intent", message: "m", allowedValues: ["A"] },
      ],
      correlationId: "body-1234567",
      retryAfterSeconds: undefined,
    });
  });

  it("maps 429 with Retry-After", async () => {
    const { client } = setup(() => json(429, { code: "RATE_LIMITED", errors: [] }, { "Retry-After": "42" }));
    expect(await submit(client)).toMatchObject({
      ok: false,
      kind: "http",
      status: 429,
      code: "RATE_LIMITED",
      retryAfterSeconds: 42,
    });
  });

  it("takes correlationId from the body on 500", async () => {
    const { client } = setup(() =>
      json(500, { code: "INTERNAL", errors: [], correlationId: "body-1234567" }, { "X-Correlation-Id": "head-1234567" }),
    );
    expect(await submit(client)).toMatchObject({ status: 500, correlationId: "body-1234567" });
  });

  it("falls back to the X-Correlation-Id header on 500 without a body", async () => {
    const { client } = setup(
      () => new Response("oops", { status: 500, headers: { "X-Correlation-Id": "head-1234567" } }),
    );
    expect(await submit(client)).toMatchObject({
      ok: false,
      kind: "http",
      status: 500,
      fieldErrors: [],
      correlationId: "head-1234567",
    });
  });

  it("maps a fetch rejection to network", async () => {
    const { client } = setup(() => Promise.reject(new TypeError("failed")));
    expect(await submit(client)).toEqual({ ok: false, kind: "network" });
  });

  it("maps a timeout to network", async () => {
    const { client } = setup(
      (request) =>
        new Promise<Response>((_, reject) => {
          request.signal.addEventListener("abort", () => reject(request.signal.reason));
        }),
      20,
    );
    expect(await submit(client)).toEqual({ ok: false, kind: "network" });
  });

  describe("without AbortSignal.any and AbortSignal.timeout (older browsers)", () => {
    const removeStatics = () => {
      const unsupported = () => {
        throw new TypeError("not supported");
      };
      vi.spyOn(AbortSignal, "any").mockImplementation(unsupported);
      vi.spyOn(AbortSignal, "timeout").mockImplementation(unsupported);
    };
    afterEach(() => vi.restoreAllMocks());

    const hang = (request: Request) =>
      new Promise<Response>((_, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason));
      });

    it("still times out", async () => {
      removeStatics();
      const { client } = setup(hang, 20);
      expect(await submit(client)).toEqual({ ok: false, kind: "network" });
    });

    it("still succeeds and honours a caller signal", async () => {
      removeStatics();
      const ok = setup(() => json(202, {}));
      expect(await submit(ok.client)).toMatchObject({ ok: true });
      const { client } = setup(hang, 5000);
      const controller = new AbortController();
      const pending = toPublicResult(
        client.POST("/api/v1/public/owner-intake-requests", { body: {} as never, signal: controller.signal }),
      );
      controller.abort();
      expect(await pending).toEqual({ ok: false, kind: "network" });
    });
  });
});
