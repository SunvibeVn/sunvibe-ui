import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { IntakeBlock } from "../types";

import { sectionAfter } from "./section-visibility";

const http = (status: number, code: string, correlationId?: string): ApiResult<IntakeBlock> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: [],
  correlationId,
});

describe("sectionAfter", () => {
  it("section_404_hidden: a 404 hides the section (the switch is off, or the lead is not visible)", () => {
    expect(sectionAfter(http(404, "NOT_FOUND"))).toEqual({ kind: "hidden" });
  });

  it("hides the section for a role the block refuses", () => {
    expect(sectionAfter(http(403, "FORBIDDEN"))).toEqual({ kind: "hidden" });
  });

  it("shows the block", () => {
    const block: IntakeBlock = { status: "DRAFT" };
    expect(sectionAfter({ ok: true, data: block, status: 200, replayed: false })).toEqual({ kind: "ready", block });
  });

  it("offers a retry after a failed read, with its support code", () => {
    expect(sectionAfter(http(500, "INTERNAL_ERROR", "c-1"))).toEqual({ kind: "error", correlationId: "c-1" });
    expect(sectionAfter({ ok: false, kind: "network" })).toEqual({ kind: "error" });
  });

  it("leaves the session states to the session screens", () => {
    expect(sectionAfter({ ok: false, kind: "signed-out" })).toEqual({ kind: "hidden" });
    expect(sectionAfter({ ok: false, kind: "unavailable" })).toEqual({ kind: "hidden" });
  });
});
