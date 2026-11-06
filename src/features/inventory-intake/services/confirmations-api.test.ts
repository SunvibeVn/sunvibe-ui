import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import { confirmOwner, declineConfirmation, enterCheckPhrase, listConfirmations, readConfirmationDetails, toConfirmationUiError, withdrawConfirmation } from "./confirmations-api";

const http = (status: number, code: string, fields: string[] = []): ApiResult<never> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: fields.map((field) => ({ field, message: "x" })),
});

function fakeApi() {
  const calls: { method: string; path: string; init: unknown }[] = [];
  const record = (method: string) => (path: string, init: unknown) => {
    calls.push({ method, path, init });
    return Promise.resolve();
  };
  const client = { GET: record("GET"), POST: record("POST") };
  const callApi = vi.fn(async (run: (c: never) => unknown) => {
    await run(client as never);
    return { ok: true, data: {}, status: 200, replayed: false } as never;
  });
  return { calls, deps: { callApi: callApi as never } };
}

describe("toConfirmationUiError", () => {
  it("api_mapsErrorCodes: maps the answers of the owner verbs, by code", () => {
    expect(toConfirmationUiError(http(400, "CONFIRMATION_INVALID"))?.kind).toBe("invalid");
    expect(toConfirmationUiError(http(400, "VALIDATION_FAILED", ["currentPassword"]))?.kind).toBe("wrong-password");
    expect(toConfirmationUiError(http(400, "VALIDATION_FAILED", ["code"]))?.kind).toBe("invalid");
    expect(toConfirmationUiError(http(423, "ACCOUNT_LOCKED"))?.kind).toBe("locked");
    expect(toConfirmationUiError(http(429, "RATE_LIMITED"))?.kind).toBe("rate-limited");
    expect(toConfirmationUiError(http(409, "CONCURRENT_MODIFICATION"))?.kind).toBe("stale");
    expect(toConfirmationUiError(http(404, "NOT_FOUND"))?.kind).toBe("gone");
    expect(toConfirmationUiError(http(500, "INTERNAL_ERROR"))?.kind).toBe("retry");
    expect(toConfirmationUiError({ ok: false, kind: "network" })?.kind).toBe("retry");
    expect(toConfirmationUiError({ ok: true, data: 1, status: 200, replayed: false })).toBeNull();
  });
});

describe("owner calls", () => {
  const base = "/api/v1/me/property-confirmations";

  it("calls each verb on its path, with the request in the path and the secrets in the body", async () => {
    const { calls, deps } = fakeApi();
    await listConfirmations(deps);
    await readConfirmationDetails("Q1", { code: "C" }, deps);
    await confirmOwner("Q1", { code: "C", currentPassword: "P", statementVersion: "V" }, deps);
    await declineConfirmation("Q1", { code: "C" }, deps);
    await enterCheckPhrase("Q1", { phrase: "F" }, deps);
    await withdrawConfirmation("Q1", { currentPassword: "P" }, deps);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${base}`,
      `POST ${base}/{id}/details`,
      `POST ${base}/{id}/confirm`,
      `POST ${base}/{id}/decline`,
      `POST ${base}/{id}/check`,
      `POST ${base}/{id}/withdrawal`,
    ]);
    expect(calls[2].init).toEqual({
      params: { path: { id: "Q1" } },
      body: { code: "C", currentPassword: "P", statementVersion: "V" },
    });
  });
});
