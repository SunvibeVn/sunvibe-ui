import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementHistory, BrokerageAgreementHistoryEntry } from "../types";

import { HISTORY_PAGE_SIZE, historyEntryRow, historyPageOutcome } from "./agreement-history-model";

const ACTIVATED: BrokerageAgreementHistoryEntry = {
  type: "ACTIVATED",
  versionNo: 2,
  actorType: "STAFF",
  actorName: "Tran Thi B",
  occurredAt: "2026-12-19T18:30:00Z",
};

describe("agreement history entries (brokerage-agreement E05-S7, S7-D7, UH-1, UH-2)", () => {
  it("agreementHistoryModel_entry_eventVersionActorAndVietnamTime: an entry reads its event, its version, its actor and its time in Vietnam time", () => {
    expect(HISTORY_PAGE_SIZE).toBe(50);
    expect(historyEntryRow(ACTIVATED)).toEqual({
      event: "history.events.ACTIVATED",
      versionNo: 2,
      actor: { name: "Tran Thi B" },
      time: "2026-12-20 01:30",
    });
    expect(
      historyEntryRow({ type: "VERSION_LAPSED", versionNo: null, actorType: "SYSTEM", actorName: null, occurredAt: "2026-12-01T00:00:00Z" }),
    ).toEqual({ event: "history.events.VERSION_LAPSED", versionNo: null, actor: { key: "history.actors.system" }, time: "2026-12-01 07:00" });
    expect(historyEntryRow({})).toEqual({ event: "history.events.OTHER", versionNo: null, actor: null, time: "" });
  });

  it("agreementHistoryModel_entry_readsNoReason: an entry carrying extra keys gives a row without them", () => {
    const entry = {
      ...ACTIVATED,
      reason: "PRIVATE REASON",
      note: "PRIVATE NOTE",
      actorUserId: "U-STAFF",
    } as BrokerageAgreementHistoryEntry;

    const row = historyEntryRow(entry);
    const text = JSON.stringify(row);

    expect(Object.keys(row).sort()).toEqual(["actor", "event", "time", "versionNo"]);
    for (const value of ["PRIVATE REASON", "PRIVATE NOTE", "U-STAFF", "reason", "note", "actorUserId"]) {
      expect(text).not.toContain(value);
    }
  });

  it("agreementHistoryModel_outcome_pageSessionOrFailed: 200 gives the rows and the total; signed out or unavailable the session; any other failure the error with the support code of an http answer", () => {
    const ok: ApiResult<BrokerageAgreementHistory> = {
      ok: true,
      data: { entries: [ACTIVATED], page: 0, size: 50, totalElements: 3 },
      status: 200,
      replayed: false,
    };

    expect(historyPageOutcome(ok)).toEqual({ kind: "page", rows: [historyEntryRow(ACTIVATED)], total: 3 });
    expect(historyPageOutcome({ ok: true, data: {}, status: 200, replayed: false })).toEqual({ kind: "page", rows: [], total: 0 });
    expect(historyPageOutcome({ ok: false, kind: "signed-out" })).toEqual({ kind: "session" });
    expect(historyPageOutcome({ ok: false, kind: "unavailable" })).toEqual({ kind: "session" });
    expect(historyPageOutcome({ ok: false, kind: "network" })).toEqual({ kind: "failed" });
    expect(historyPageOutcome({ ok: false, kind: "http", status: 404, fieldErrors: [], correlationId: "c-9" })).toEqual({
      kind: "failed",
      correlationId: "c-9",
    });
  });
});
