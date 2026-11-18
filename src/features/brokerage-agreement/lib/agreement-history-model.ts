import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementHistory, BrokerageAgreementHistoryEntry } from "../types";

import { vietnamTimeText } from "./date-text";
import { historyActorText, historyEventText, type HistoryActor } from "./history-text";
import type { EligibilityKey } from "./reason-text";

/** Events per page of the history (brokerage-agreement E05-S7, S7-D7: the API's default). */
export const HISTORY_PAGE_SIZE = 50;

/**
 * One entry of the history as the section shows it (brokerage-agreement E05-S7, US-4 AC-4): the event, the version it is
 * about (null for none), who acted (null for an actor type this UI does not know) and the time in Vietnam time. Never a
 * reason, a note or a user id (BR-17).
 */
export type HistoryEntryRow = { event: EligibilityKey; versionNo: number | null; actor: HistoryActor | null; time: string };

/** What one read of a history page leaves: its rows and the total, nothing for a session state, or the error. */
export type HistoryPageOutcome =
  | { kind: "page"; rows: HistoryEntryRow[]; total: number }
  | { kind: "session" }
  | { kind: "failed"; correlationId?: string };

/** The row of one entry, from its type, version, actor type, actor name and time only (brokerage-agreement S7-D7). */
export function historyEntryRow(entry: BrokerageAgreementHistoryEntry): HistoryEntryRow {
  const { type, versionNo, actorType, actorName, occurredAt } = entry;
  return {
    event: historyEventText(type),
    versionNo: versionNo ?? null,
    actor: historyActorText(actorType, actorName),
    time: vietnamTimeText(occurredAt ?? ""),
  };
}

/**
 * Turns a history answer into its outcome (brokerage-agreement E05-S7, spec section 6), by kind, never by message: 200 →
 * the rows, newest first as answered, and the total; signed out or unavailable → the session screens answer; any other
 * failure → the error, with the support code of an http answer.
 */
export function historyPageOutcome(result: ApiResult<BrokerageAgreementHistory>): HistoryPageOutcome {
  if (result.ok) {
    return { kind: "page", rows: (result.data.entries ?? []).map(historyEntryRow), total: result.data.totalElements ?? 0 };
  }
  switch (result.kind) {
    case "signed-out":
    case "unavailable":
      return { kind: "session" };
    case "network":
      return { kind: "failed" };
    case "http":
      return result.correlationId === undefined ? { kind: "failed" } : { kind: "failed", correlationId: result.correlationId };
  }
}
