import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import type { FieldError } from "@/lib/api";

import type { LeadNoteResult } from "../types";

import { submitNote, type NoteFlowDeps } from "./note-flow";

const http = (status: number, code?: string, fieldErrors: FieldError[] = [], correlationId?: string): ApiResult<LeadNoteResult> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors,
  correlationId,
});

const created: LeadNoteResult = { activity: { type: "NOTE_ADDED", note: "x" }, lead: { id: "L1", version: 2, lastActivityAt: "2026-10-20T03:00:00Z" } };

function deps(reply: ApiResult<LeadNoteResult>) {
  const calls: { leadId: string; input: unknown }[] = [];
  const flowDeps: NoteFlowDeps = {
    addNote: async (leadId, input) => {
      calls.push({ leadId, input });
      return reply;
    },
  };
  return { calls, flowDeps };
}

const ok = { ok: true, data: created, status: 201, replayed: false } as const;

describe("submitNote (US-5, C-36, W11-31, W11-36)", () => {
  it("sends the trimmed note without nextActionAt when the field is empty (keeps the current one)", async () => {
    const { calls, flowDeps } = deps(ok);
    const outcome = await submitNote({ leadId: "L1", note: "  Gọi lại  ", nextAction: "" }, flowDeps);
    expect(outcome).toEqual({ kind: "saved", result: created });
    expect(calls).toEqual([{ leadId: "L1", input: { note: "Gọi lại" } }]);
  });

  it("reads the next action as Vietnam time and sends it as an instant", async () => {
    const { calls, flowDeps } = deps(ok);
    await submitNote({ leadId: "L1", note: "a", nextAction: "2026-10-18T09:05" }, flowDeps);
    expect(calls[0].input).toEqual({ note: "a", nextActionAt: "2026-10-18T02:05:00.000Z" });
  });

  it("checks before any call: blank or too long note, impossible next action", async () => {
    const { calls, flowDeps } = deps(ok);
    expect(await submitNote({ leadId: "L1", note: "  ", nextAction: "" }, flowDeps)).toEqual({
      kind: "invalid",
      note: "required",
    });
    expect(await submitNote({ leadId: "L1", note: "a".repeat(2001), nextAction: "" }, flowDeps)).toEqual({
      kind: "invalid",
      note: "tooLong",
    });
    expect(await submitNote({ leadId: "L1", note: "a", nextAction: "2026-02-31T10:00" }, flowDeps)).toEqual({
      kind: "invalid",
      nextAction: "invalid",
    });
    expect(await submitNote({ leadId: "L1", note: "", nextAction: "nope" }, flowDeps)).toEqual({
      kind: "invalid",
      note: "required",
      nextAction: "invalid",
    });
    expect(calls).toHaveLength(0);
  });

  it("409 INVALID_STATE_TRANSITION means the lead was closed meanwhile (text stays, W11-36)", async () => {
    const { flowDeps } = deps(http(409, "INVALID_STATE_TRANSITION", [], "c-1"));
    expect(await submitNote({ leadId: "L1", note: "a", nextAction: "" }, flowDeps)).toEqual({
      kind: "closed",
      correlationId: "c-1",
    });
  });

  it("any other 409 is a concurrent change (draft kept)", async () => {
    const { flowDeps } = deps(http(409, "CONCURRENT_MODIFICATION"));
    expect(await submitNote({ leadId: "L1", note: "a", nextAction: "" }, flowDeps)).toEqual({ kind: "stale" });
  });

  it("404 means the lead is gone for this user (C-37)", async () => {
    expect((await submitNote({ leadId: "L1", note: "a", nextAction: "" }, deps(http(404)).flowDeps)).kind).toBe("gone");
  });

  it("403 is the forbidden notice in place, with the support code (CR-9, spec 5.2)", async () => {
    expect(await submitNote({ leadId: "L1", note: "a", nextAction: "" }, deps(http(403, undefined, [], "c-3")).flowDeps)).toEqual({
      kind: "forbidden",
      correlationId: "c-3",
    });
    expect(await submitNote({ leadId: "L1", note: "a", nextAction: "" }, deps(http(403)).flowDeps)).toEqual({
      kind: "forbidden",
    });
  });

  it("400 names the fields the server rejected", async () => {
    const { flowDeps } = deps(
      http(400, "VALIDATION_FAILED", [
        { field: "nextActionAt", message: "bad" },
        { field: "note", message: "bad" },
      ]),
    );
    expect(await submitNote({ leadId: "L1", note: "a", nextAction: "" }, flowDeps)).toEqual({
      kind: "rejected",
      note: true,
      nextAction: true,
    });
    const general = deps(http(400, "VALIDATION_FAILED", [{ field: "other", message: "x" }]));
    expect(await submitNote({ leadId: "L1", note: "a", nextAction: "" }, general.flowDeps)).toEqual({
      kind: "rejected",
    });
  });

  it("network, 5xx, 429 and an unavailable session are failures that keep the draft", async () => {
    expect(
      await submitNote({ leadId: "L1", note: "a", nextAction: "" }, deps({ ok: false, kind: "network" }).flowDeps),
    ).toEqual({ kind: "failed" });
    expect(
      await submitNote({ leadId: "L1", note: "a", nextAction: "" }, deps(http(503, undefined, [], "c-9")).flowDeps),
    ).toEqual({ kind: "failed", correlationId: "c-9" });
    expect(
      await submitNote({ leadId: "L1", note: "a", nextAction: "" }, deps({ ok: false, kind: "unavailable" }).flowDeps),
    ).toEqual({ kind: "failed" });
    expect(
      await submitNote({ leadId: "L1", note: "a", nextAction: "" }, deps({ ok: false, kind: "signed-out" }).flowDeps),
    ).toEqual({ kind: "failed" });
  });
});
