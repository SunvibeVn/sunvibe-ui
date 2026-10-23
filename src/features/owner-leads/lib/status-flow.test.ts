import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ChangeStatusInput } from "../services/owner-leads-api";
import type { DuplicateCandidate, LeadPage, LeadSummary } from "../types";

import {
  prepareStatusChange,
  REASON_MAX,
  resolveOriginal,
  sendStatusChange,
  type StatusContext,
  type StatusFlowDeps,
  type StatusForm,
} from "./status-flow";

const LEAD = "01JLEAD0000000000000000001";
const ORIGINAL = "01JLEAD0000000000000000002";

const candidates: DuplicateCandidate[] = [
  { id: ORIGINAL, requestCode: "SV-AAAA-BBBB", status: "REJECTED", createdAt: "2026-10-01T03:00:00Z" },
  { id: "01JLEAD0000000000000000003", requestCode: "SV-CCCC-DDDD", status: "DUPLICATE" },
];

const ctx = (scope: "all" | "mine" = "all"): StatusContext => ({ leadId: LEAD, candidates, scope });

const page = (items: LeadSummary[]): ApiResult<LeadPage> => ({
  ok: true,
  data: { items, page: 0, size: 5, totalElements: items.length },
  status: 200,
  replayed: false,
});

function deps(lookup: ApiResult<LeadPage> = page([]), reply?: ApiResult<LeadSummary>) {
  const lookups: { code: string; scope: string }[] = [];
  const sent: { leadId: string; input: ChangeStatusInput }[] = [];
  const flowDeps: StatusFlowDeps = {
    findLeadByRequestCode: async (code, scope) => {
      lookups.push({ code, scope });
      return lookup;
    },
    changeStatus: async (leadId, input) => {
      sent.push({ leadId, input });
      return reply ?? { ok: true, data: { id: leadId, version: 9, lastActivityAt: "2026-10-20T03:00:00Z" }, status: 200, replayed: false };
    },
  };
  return { lookups, sent, flowDeps };
}

const form = (patch: Partial<StatusForm>): StatusForm => ({
  target: null,
  reason: "",
  note: "",
  nextAction: "",
  original: { kind: "none" },
  ...patch,
});

describe("prepareStatusChange: non-closing targets (US-6)", () => {
  it("asks for a target first", async () => {
    const { flowDeps } = deps();
    expect(await prepareStatusChange(form({}), ctx(), flowDeps)).toEqual({
      kind: "invalid",
      problems: { target: "required" },
    });
  });

  it("sends only the target when note and next action are empty", async () => {
    const { flowDeps } = deps();
    expect(await prepareStatusChange(form({ target: "CONTACTED", note: "   " }), ctx(), flowDeps)).toEqual({
      kind: "send",
      request: { toStatus: "CONTACTED" },
    });
  });

  it("sends the trimmed note and the next action read as Vietnam time; a reason typed earlier is not sent", async () => {
    const { flowDeps } = deps();
    expect(
      await prepareStatusChange(
        form({ target: "ON_HOLD", note: "  Gọi lại sau  ", nextAction: "2026-10-20T09:05", reason: "cũ" }),
        ctx(),
        flowDeps,
      ),
    ).toEqual({
      kind: "send",
      request: { toStatus: "ON_HOLD", note: "Gọi lại sau", nextActionAt: "2026-10-20T02:05:00.000Z" },
    });
  });

  it("refuses an impossible next action and a note over 2000 units", async () => {
    const { flowDeps } = deps();
    expect(
      await prepareStatusChange(
        form({ target: "CONTACTED", note: "a".repeat(2001), nextAction: "2026-02-31T10:00" }),
        ctx(),
        flowDeps,
      ),
    ).toEqual({ kind: "invalid", problems: { note: "tooLong", nextAction: "invalid" } });
  });
});

describe("prepareStatusChange: closing targets (US-6 AC-2, AC-4)", () => {
  it("needs a reason of 1..500 units", async () => {
    const { flowDeps } = deps();
    expect(await prepareStatusChange(form({ target: "REJECTED", reason: "  " }), ctx(), flowDeps)).toEqual({
      kind: "invalid",
      problems: { reason: "required" },
    });
    expect(
      await prepareStatusChange(form({ target: "WITHDRAWN", reason: "a".repeat(REASON_MAX + 1) }), ctx(), flowDeps),
    ).toEqual({ kind: "invalid", problems: { reason: "tooLong" } });
  });

  it("asks for confirmation with the trimmed reason and never sends a next action or note", async () => {
    const { flowDeps, sent } = deps();
    expect(
      await prepareStatusChange(
        form({ target: "REJECTED", reason: " Không hợp tác ", note: "x", nextAction: "2026-10-20T09:05" }),
        ctx(),
        flowDeps,
      ),
    ).toEqual({ kind: "confirm", request: { toStatus: "REJECTED", reason: "Không hợp tác" } });
    expect(sent).toEqual([]);
  });

  it("DUPLICATE needs an original", async () => {
    const { flowDeps } = deps();
    expect(await prepareStatusChange(form({ target: "DUPLICATE", reason: "trùng" }), ctx(), flowDeps)).toEqual({
      kind: "invalid",
      problems: { original: "required" },
    });
  });

  it("DUPLICATE with a picked candidate previews it", async () => {
    const { flowDeps, lookups } = deps();
    expect(
      await prepareStatusChange(
        form({ target: "DUPLICATE", reason: "trùng", original: { kind: "candidate", id: ORIGINAL } }),
        ctx(),
        flowDeps,
      ),
    ).toEqual({
      kind: "confirm",
      request: { toStatus: "DUPLICATE", reason: "trùng", duplicateOfLeadId: ORIGINAL },
      original: { id: ORIGINAL, requestCode: "SV-AAAA-BBBB", status: "REJECTED", createdAt: "2026-10-01T03:00:00Z" },
    });
    expect(lookups).toEqual([]);
  });

  it("reports every field problem at once and looks nothing up then", async () => {
    const { flowDeps, lookups } = deps();
    expect(
      await prepareStatusChange(
        form({ target: "DUPLICATE", reason: "", original: { kind: "text", text: "sv-aaaa-bbbb" } }),
        ctx(),
        flowDeps,
      ),
    ).toEqual({ kind: "invalid", problems: { reason: "required" } });
    expect(lookups).toEqual([]);
  });

  it("DUPLICATE with a code looks it up and previews the hit", async () => {
    const hit: LeadSummary = { id: ORIGINAL, requestCode: "SV-AAAA-BBBB", status: "REJECTED", createdAt: "2026-10-01T03:00:00Z", lastActivityAt: "2026-10-20T03:00:00Z" };
    const { flowDeps, lookups } = deps(page([hit]));
    const step = await prepareStatusChange(
      form({ target: "DUPLICATE", reason: "trùng", original: { kind: "text", text: " sv-aaaa-bbbb " } }),
      ctx("mine"),
      flowDeps,
    );
    expect(step).toEqual({
      kind: "confirm",
      request: { toStatus: "DUPLICATE", reason: "trùng", duplicateOfLeadId: ORIGINAL },
      original: { id: ORIGINAL, requestCode: "SV-AAAA-BBBB", status: "REJECTED", createdAt: "2026-10-01T03:00:00Z" },
    });
    expect(lookups).toEqual([{ code: "SV-AAAA-BBBB", scope: "mine" }]);
  });

  it("DUPLICATE with a pasted link sends the id without a lookup or preview data", async () => {
    const { flowDeps, lookups } = deps();
    expect(
      await prepareStatusChange(
        form({
          target: "DUPLICATE",
          reason: "trùng",
          original: { kind: "text", text: `https://sunvibe.vn/workspace/owner-leads/${ORIGINAL.toLowerCase()}` },
        }),
        ctx(),
        flowDeps,
      ),
    ).toEqual({
      kind: "confirm",
      request: { toStatus: "DUPLICATE", reason: "trùng", duplicateOfLeadId: ORIGINAL },
      original: { id: ORIGINAL },
    });
    expect(lookups).toEqual([]);
  });
});

describe("resolveOriginal (C-21, W11-33)", () => {
  it("refuses a candidate in DUPLICATE, an unknown candidate and the lead itself", async () => {
    const { flowDeps } = deps();
    expect(await resolveOriginal({ kind: "candidate", id: "01JLEAD0000000000000000003" }, ctx(), flowDeps)).toEqual({
      kind: "problem",
      problem: "duplicate",
    });
    expect(await resolveOriginal({ kind: "candidate", id: "nope" }, ctx(), flowDeps)).toEqual({
      kind: "problem",
      problem: "required",
    });
    const selfCtx: StatusContext = { ...ctx(), candidates: [{ id: LEAD, status: "NEW" }] };
    expect(await resolveOriginal({ kind: "candidate", id: LEAD }, selfCtx, flowDeps)).toEqual({
      kind: "problem",
      problem: "self",
    });
  });

  it("refuses empty or unreadable text and a link to the lead itself, without a call", async () => {
    const { flowDeps, lookups } = deps();
    expect(await resolveOriginal({ kind: "text", text: "  " }, ctx(), flowDeps)).toEqual({
      kind: "problem",
      problem: "required",
    });
    expect(await resolveOriginal({ kind: "text", text: "SV-AAAA BBBB" }, ctx(), flowDeps)).toEqual({
      kind: "problem",
      problem: "invalid",
    });
    expect(await resolveOriginal({ kind: "text", text: `/workspace/owner-leads/${LEAD}` }, ctx(), flowDeps)).toEqual({
      kind: "problem",
      problem: "self",
    });
    expect(lookups).toEqual([]);
  });

  it("refuses a code that finds nothing, the lead itself or a DUPLICATE lead", async () => {
    expect(await resolveOriginal({ kind: "text", text: "SV-AAAA-BBBB" }, ctx(), deps(page([])).flowDeps)).toEqual({
      kind: "problem",
      problem: "not-found",
    });
    const self = page([{ id: LEAD, requestCode: "SV-AAAA-BBBB", status: "NEW", lastActivityAt: "2026-10-20T03:00:00Z" }]);
    expect(await resolveOriginal({ kind: "text", text: "SV-AAAA-BBBB" }, ctx(), deps(self).flowDeps)).toEqual({
      kind: "problem",
      problem: "self",
    });
    const dup = page([{ id: ORIGINAL, requestCode: "SV-AAAA-BBBB", status: "DUPLICATE", lastActivityAt: "2026-10-20T03:00:00Z" }]);
    expect(await resolveOriginal({ kind: "text", text: "SV-AAAA-BBBB" }, ctx(), deps(dup).flowDeps)).toEqual({
      kind: "problem",
      problem: "duplicate",
    });
    const other = page([{ id: ORIGINAL, requestCode: "SV-ZZZZ-ZZZZ", status: "NEW", lastActivityAt: "2026-10-20T03:00:00Z" }]);
    expect(await resolveOriginal({ kind: "text", text: "SV-AAAA-BBBB" }, ctx(), deps(other).flowDeps)).toEqual({
      kind: "problem",
      problem: "not-found",
    });
  });

  it("maps a failed lookup: 400 is an invalid code, 403 forbidden, the rest a retry", async () => {
    const bad: ApiResult<LeadPage> = { ok: false, kind: "http", status: 400, fieldErrors: [{ field: "requestCode", message: "x" }] };
    expect(await resolveOriginal({ kind: "text", text: "SV-AAAA-BBBB" }, ctx(), deps(bad).flowDeps)).toEqual({
      kind: "problem",
      problem: "invalid",
    });
    const forbidden: ApiResult<LeadPage> = { ok: false, kind: "http", status: 403, fieldErrors: [], correlationId: "c" };
    expect(await resolveOriginal({ kind: "text", text: "SV-AAAA-BBBB" }, ctx(), deps(forbidden).flowDeps)).toEqual({
      kind: "lookup-failed",
      failure: { kind: "forbidden", correlationId: "c" },
    });
    expect(
      await resolveOriginal({ kind: "text", text: "SV-AAAA-BBBB" }, ctx(), deps({ ok: false, kind: "network" }).flowDeps),
    ).toEqual({ kind: "lookup-failed", failure: { kind: "failed" } });
  });
});

describe("sendStatusChange (spec 5.2 versions)", () => {
  it("adds the expected version given at send time", async () => {
    const { flowDeps, sent } = deps();
    const outcome = await sendStatusChange(LEAD, { toStatus: "CONTACTED" }, 7, flowDeps);
    expect(sent).toEqual([{ leadId: LEAD, input: { toStatus: "CONTACTED", expectedVersion: 7 } }]);
    expect(outcome).toEqual({ kind: "saved", summary: { id: LEAD, version: 9, lastActivityAt: "2026-10-20T03:00:00Z" } });
  });

  it("returns the mapped failure", async () => {
    const reply: ApiResult<LeadSummary> = {
      ok: false,
      kind: "http",
      status: 409,
      code: "CONCURRENT_MODIFICATION",
      fieldErrors: [],
    };
    const { flowDeps } = deps(page([]), reply);
    expect(await sendStatusChange(LEAD, { toStatus: "REJECTED", reason: "x" }, 7, flowDeps)).toEqual({ kind: "stale" });
  });
});
