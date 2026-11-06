import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { IntakeCompletionResult } from "../types";

import { previewOfRead, runCompletion } from "./preview-state";

const http = (status: number, code: string): ApiResult<IntakeCompletionResult> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: [],
  correlationId: "c-1",
});

function flow(answer: ApiResult<IntakeCompletionResult>) {
  const order: string[] = [];
  const run = runCompletion({
    send: async () => {
      order.push("send");
      return answer;
    },
    clear: () => order.push("clear"),
    reload: async () => {
      order.push("reload");
    },
  });
  return { order, run };
}

describe("runCompletion", () => {
  it("preview_stale_reloadsAndClears: a failed previewHash forgets the preview before it reads the block", async () => {
    const { order, run } = flow(http(409, "INTAKE_PREVIEW_STALE"));
    await expect(run).resolves.toMatchObject({ kind: "message", message: { key: "errors.preview-stale", correlationId: "c-1" } });
    expect(order).toEqual(["send", "clear", "reload"]);
  });

  it("version_stale_reloads: a stale version forgets the preview and reads the block too", async () => {
    const { order, run } = flow(http(409, "CONCURRENT_MODIFICATION"));
    await expect(run).resolves.toMatchObject({ kind: "message", message: { key: "errors.stale" } });
    expect(order).toEqual(["send", "clear", "reload"]);
  });

  it("reads the block after a late duplicate check, which now reads CASE_OPEN", async () => {
    const { order, run } = flow(http(409, "INTAKE_DUPLICATE_CHECK"));
    await expect(run).resolves.toMatchObject({ kind: "message", message: { key: "errors.duplicate-check" } });
    expect(order).toEqual(["send", "clear", "reload"]);
  });

  it("forgets the preview on a refused link as well: nothing of it can be completed", async () => {
    const { order, run } = flow(http(400, "LINK_MAPPING_INVALID"));
    await run;
    expect(order).toEqual(["send", "clear", "reload"]);
  });

  it("reads the block after a lost answer: the completion may have committed", async () => {
    const { order, run } = flow({ ok: false, kind: "network" });
    await expect(run).resolves.toMatchObject({ kind: "message", message: { key: "errors.retry" } });
    expect(order).toEqual(["send", "clear", "reload"]);
  });

  it("reads the block after a completion, and answers its result", async () => {
    const data: IntakeCompletionResult = { propertyCode: "SV-HOU-1", mode: "CREATE" };
    const { order, run } = flow({ ok: true, data, status: 200, replayed: false });
    await expect(run).resolves.toEqual({ kind: "done", data });
    expect(order).toEqual(["send", "reload"]);
  });

  it("does nothing more on a 404 or a lost session", async () => {
    const gone = flow(http(404, "NOT_FOUND"));
    await expect(gone.run).resolves.toEqual({ kind: "leave" });
    expect(gone.order).toEqual(["send"]);
    const out = flow({ ok: false, kind: "signed-out" });
    await expect(out.run).resolves.toEqual({ kind: "session" });
    expect(out.order).toEqual(["send"]);
  });

  it("never throws for a reload that fails", async () => {
    const reload = vi.fn(async () => false);
    await expect(runCompletion({ send: async () => http(409, "INTAKE_STATE"), clear: () => undefined, reload })).resolves.toMatchObject({
      kind: "message",
    });
  });
});

describe("previewOfRead", () => {
  const preview = { previewHash: "h" };
  const read = { version: 3, attempt: 1, preview };

  it("gives the preview read for this version and this attempt", () => {
    expect(previewOfRead(read, 3, 1)).toBe(preview);
  });

  it("preview_stale_reloadsAndClears: gives nothing of a preview read for another version", () => {
    expect(previewOfRead(read, 4, 1)).toBeNull();
  });

  it("preview_stale_reloadsAndClears: gives nothing of a preview a refusal asked to forget", () => {
    expect(previewOfRead(read, 3, 2)).toBeNull();
  });

  it("gives nothing before a read", () => {
    expect(previewOfRead(null, 3, 1)).toBeNull();
  });
});
