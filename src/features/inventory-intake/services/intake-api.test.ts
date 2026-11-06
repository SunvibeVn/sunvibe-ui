import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import {
  askOwnerConfirmation,
  completeIntake,
  getLeadFacts,
  putTarget,
  searchInventory,
  toIntakeUiError,
} from "./intake-api";

const http = (status: number, code: string, fieldErrors: { field: string; message: string }[] = []): ApiResult<never> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors,
  correlationId: "c-1",
});

/** A fake typed client: the call it received, and the answer it gives. */
function fakeApi(data: unknown = {}) {
  const calls: { method: string; path: string; init: unknown }[] = [];
  const record = (method: string) => (path: string, init: unknown) => {
    calls.push({ method, path, init });
    return Promise.resolve();
  };
  const client = { GET: record("GET"), POST: record("POST"), PUT: record("PUT") };
  const callApi = vi.fn(async (run: (c: never) => unknown) => {
    await run(client as never);
    return { ok: true, data, status: 200, replayed: false } as never;
  });
  return { calls, deps: { callApi: callApi as never } };
}

describe("toIntakeUiError", () => {
  it("api_mapsErrorCodes: gives each refusal of the handoff its own case, by code and never by message", () => {
    const table: [number, string, string][] = [
      [403, "INTAKE_NOT_ASSIGNEE", "not-assignee"],
      [403, "OWNER_CHECK_NOT_ALLOWED", "check-not-allowed"],
      [403, "CASE_NOT_ALLOWED", "case-not-allowed"],
      [404, "NOT_FOUND", "not-found"],
      [400, "INTAKE_SELECTION_INVALID", "selection-invalid"],
      [400, "LINK_MAPPING_INVALID", "link-invalid"],
      [409, "CONCURRENT_MODIFICATION", "stale"],
      [409, "INTAKE_STATE", "state"],
      [409, "OWNER_PROOF_REQUIRED", "proof-required"],
      [409, "CANONICAL_UNRECONCILED", "canonical"],
      [409, "INTAKE_CREATE_NOT_ALLOWED", "create-not-allowed"],
      [409, "INTAKE_DISPUTED", "disputed"],
      [409, "INTAKE_SOURCE_INVALID", "source-invalid"],
      [409, "AVAILABILITY_NOT_CONFIRMED", "availability"],
      [409, "INTAKE_PREVIEW_STALE", "preview-stale"],
      [409, "INTAKE_DUPLICATE_CHECK", "duplicate-check"],
      [409, "INTAKE_ALREADY_COMPLETED", "already-completed"],
      [429, "OWNER_REQUEST_LIMIT", "request-limit"],
      [429, "RATE_LIMITED", "rate-limited"],
    ];
    for (const [status, code, kind] of table) {
      expect(toIntakeUiError(http(status, code))).toEqual({ kind, correlationId: "c-1" });
    }
  });

  it("api_mapsErrorCodes: reads each gate reason from its error entry", () => {
    const failed = http(409, "INTAKE_GATE_FAILED", [
      { field: "gate.NOT_QUALIFIED", message: "x" },
      { field: "gate.RESTRICTED", message: "x" },
      { field: "gate.SOMETHING_NEW", message: "x" },
      { field: "other", message: "x" },
    ]);
    expect(toIntakeUiError(failed)).toEqual({
      kind: "gate",
      gateReasons: ["NOT_QUALIFIED", "RESTRICTED"],
      correlationId: "c-1",
    });
  });

  it("api_mapsErrorCodes: names the refused fields of a validation answer, without its messages", () => {
    const failed = http(400, "VALIDATION_FAILED", [
      { field: "ownerEmail", message: "secret text" },
      { field: "ownerEmail", message: "again" },
    ]);
    expect(toIntakeUiError(failed)).toEqual({ kind: "validation", fields: ["ownerEmail"], correlationId: "c-1" });
  });

  it("api_mapsErrorCodes: an unknown conflict reloads, anything else unknown retries", () => {
    expect(toIntakeUiError(http(409, "NEW_CONFLICT"))?.kind).toBe("stale");
    expect(toIntakeUiError(http(403, "NEW_FORBIDDEN"))?.kind).toBe("forbidden");
    expect(toIntakeUiError(http(500, "INTERNAL_ERROR"))?.kind).toBe("retry");
    expect(toIntakeUiError({ ok: false, kind: "network" })?.kind).toBe("retry");
    expect(toIntakeUiError({ ok: false, kind: "signed-out" })?.kind).toBe("signed-out");
    expect(toIntakeUiError({ ok: false, kind: "unavailable" })?.kind).toBe("unavailable");
    expect(toIntakeUiError({ ok: true, data: {}, status: 200, replayed: false })).toBeNull();
  });
});

describe("intake calls", () => {
  const base = "/api/v1/staff/owner-leads/{leadId}/inventory-intake";

  it("sends the owner request on its path, with the lead in the path and no id in the query", async () => {
    const { calls, deps } = fakeApi();
    await askOwnerConfirmation("L1", { ownerEmail: "a@b.vn", expectedVersion: 3 }, deps);
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${base}/owner-confirmation`,
        init: { params: { path: { leadId: "L1" } }, body: { ownerEmail: "a@b.vn", expectedVersion: 3 } },
      },
    ]);
  });

  it("puts a target and completes with the preview hash", async () => {
    const { calls, deps } = fakeApi();
    await putTarget("L1", { mode: "CREATE", expectedVersion: 1 }, deps);
    await completeIntake("L1", { expectedVersion: 2, previewHash: "h" }, deps);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([`PUT ${base}/target`, `POST ${base}/completion`]);
  });

  it("searches by the given query only", async () => {
    const { calls, deps } = fakeApi();
    await searchInventory("L1", { propertyCode: "SV-HOU-001" }, deps);
    expect(calls[0].init).toEqual({ params: { path: { leadId: "L1" }, query: { propertyCode: "SV-HOU-001" } } });
  });

  it("keeps only the assignee and the request code of the lead", async () => {
    const { deps } = fakeApi({ assignedUserId: "U1", requestCode: "R-1", phone: "0901234567", email: "a@b.vn" });
    const result = await getLeadFacts("L1", deps);
    expect(result).toMatchObject({ ok: true, data: { assignedUserId: "U1", requestCode: "R-1" } });
    expect(JSON.stringify(result)).not.toContain("0901234567");
  });
});
