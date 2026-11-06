import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import { commandFailure, commandOutcome, runCommand } from "./intake-command";

const http = (status: number, code: string, fields: string[] = []): ApiResult<string> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: fields.map((field) => ({ field, message: "x" })),
  correlationId: "c-1",
});

describe("commandFailure", () => {
  it("leaves the session states to the session screens", () => {
    expect(commandFailure({ ok: false, kind: "signed-out" })).toEqual({ kind: "session" });
    expect(commandFailure({ ok: false, kind: "unavailable" })).toEqual({ kind: "session" });
  });

  it("leaves the page on a 404: the lead or the intake is gone for this user", () => {
    expect(commandFailure(http(404, "NOT_FOUND"))).toEqual({ kind: "leave" });
  });

  it("names the refused fields, and keeps the form", () => {
    expect(commandFailure(http(400, "VALIDATION_FAILED", ["ownerEmail"]))).toEqual({ kind: "fields", fields: ["ownerEmail"] });
  });

  it("a validation answer with no field shows a message and reads nothing", () => {
    expect(commandFailure(http(400, "VALIDATION_FAILED"))).toEqual({
      kind: "message",
      message: { key: "errors.validation", correlationId: "c-1" },
      reload: false,
    });
  });

  it("every conflict reads the block again", () => {
    for (const code of ["CONCURRENT_MODIFICATION", "INTAKE_STATE", "INTAKE_GATE_FAILED", "INTAKE_PREVIEW_STALE", "SOMETHING_NEW"]) {
      const step = commandFailure(http(409, code));
      expect(step).toMatchObject({ kind: "message", reload: true });
    }
  });

  it("a refused assignee reads the block again: the lead may have moved", () => {
    expect(commandFailure(http(403, "INTAKE_NOT_ASSIGNEE"))).toMatchObject({
      kind: "message",
      message: { key: "errors.not-assignee" },
      reload: true,
    });
  });

  it("a limit keeps the form and reads nothing", () => {
    expect(commandFailure(http(429, "OWNER_REQUEST_LIMIT"))).toMatchObject({ message: { key: "errors.request-limit" }, reload: false });
    expect(commandFailure(http(429, "RATE_LIMITED"))).toMatchObject({ message: { key: "errors.rate-limited" }, reload: false });
  });

  it("a refused link keeps the mapping to correct", () => {
    expect(commandFailure(http(400, "LINK_MAPPING_INVALID"))).toMatchObject({ message: { key: "errors.link-invalid" }, reload: false });
  });

  it("a 5xx or a lost answer reads the block again: the command may have committed", () => {
    expect(commandFailure(http(500, "INTERNAL_ERROR"))).toMatchObject({ message: { key: "errors.retry" }, reload: true });
    expect(commandFailure({ ok: false, kind: "network" })).toMatchObject({ message: { key: "errors.retry" }, reload: true });
  });
});

describe("runCommand", () => {
  it("answers the data of a success, without reading", async () => {
    const reload = vi.fn(async () => undefined);
    await expect(runCommand({ send: async () => ({ ok: true, data: "d", status: 200, replayed: false }), reload })).resolves.toEqual({
      kind: "done",
      data: "d",
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it("reads the block before it answers a conflict", async () => {
    const order: string[] = [];
    const step = await runCommand({
      send: async () => http(409, "CONCURRENT_MODIFICATION"),
      reload: async () => {
        order.push("reload");
      },
    });
    order.push(step.kind);
    expect(order).toEqual(["reload", "message"]);
  });

  it("reads nothing for fields", async () => {
    const reload = vi.fn(async () => undefined);
    await runCommand({ send: async () => http(400, "VALIDATION_FAILED", ["note"]), reload });
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("commandOutcome", () => {
  const message = { key: "errors.stale" as const };

  it("a refusal that reads the block goes to the page: the form may unmount under it", () => {
    expect(commandOutcome({ kind: "message", message, reload: true })).toEqual({ state: { message: null, fields: [] }, notice: message });
  });

  it("a refusal that keeps the page stays in the form", () => {
    expect(commandOutcome({ kind: "message", message, reload: false })).toEqual({ state: { message, fields: [] }, notice: null });
  });

  it("a field refusal stays in the form", () => {
    expect(commandOutcome({ kind: "fields", fields: ["note"] })).toEqual({
      state: { message: { key: "errors.validation" }, fields: ["note"] },
      notice: null,
    });
  });

  it("nothing shows after a success, a session state or a leave", () => {
    const idle = { state: { message: null, fields: [] }, notice: null };
    expect(commandOutcome({ kind: "session" })).toEqual(idle);
    expect(commandOutcome({ kind: "leave" })).toEqual(idle);
    expect(commandOutcome({ kind: "done", data: 1 })).toEqual(idle);
  });
});
