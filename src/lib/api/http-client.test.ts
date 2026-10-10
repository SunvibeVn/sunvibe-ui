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
