import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementDetail } from "../types";

import { calendarDateText } from "./date-text";
import type { EligibilityKey } from "./reason-text";
import { agreementStatusText, transactionTypeText, versionStatusText } from "./status-text";

/**
 * The header of the agreement page. `unitCode` is null when the unit had no code at creation; `createdAt` (UTC) and
 * `leadPath` are null only when the answer left them out.
 */
export type AgreementHeader = {
  statusKey: EligibilityKey;
  transactionTypeKey: EligibilityKey;
  unitCode: string | null;
  createdAt: string | null;
  leadPath: string | null;
};

/** One version of the agreement, its dates as calendar dates. */
export type VersionRow = { versionNo: number; statusKey: EligibilityKey; startText: string; endText: string };

/** What a read of the agreement leaves on screen. */
export type AgreementModel =
  | { kind: "loading" }
  /** Signed out or unavailable: the session screens answer, the page shows nothing. */
  | { kind: "session" }
  /** Unknown, malformed, not visible (404) or a role that may not read it (403): one text for all. */
  | { kind: "not-found" }
  | { kind: "error"; correlationId?: string }
  | { kind: "ready"; agreement: AgreementHeader; versions: VersionRow[] };

/** The workspace page of one agreement. */
export function agreementPath(agreementId: string): string {
  return `/workspace/brokerage-agreements/${agreementId}`;
}

const NOT_FOUND_STATUSES = new Set([403, 404]);

/**
 * Turns the detail answer into the page's model (brokerage-agreement E05-S2, spec section 6), by kind and status, never
 * by message: 200 → the header and the versions by number; 404 and 403 → not available; any other failure → a retry
 * with its support code; no session → the session screens.
 */
export function agreementAfter(result: ApiResult<BrokerageAgreementDetail>): AgreementModel {
  if (result.ok) {
    const { status, transactionType, unitCode, createdAt, basisLeadId, versions } = result.data;
    const agreement: AgreementHeader = {
      statusKey: agreementStatusText(status ?? ""),
      transactionTypeKey: transactionTypeText(transactionType ?? ""),
      unitCode: unitCode ?? null,
      createdAt: createdAt ?? null,
      leadPath: basisLeadId === undefined ? null : `/workspace/owner-leads/${basisLeadId}`,
    };
    const rows = (versions ?? [])
      .map(
        (version): VersionRow => ({
          versionNo: version.versionNo ?? 0,
          statusKey: versionStatusText(version.status ?? ""),
          startText: calendarDateText(version.startDate ?? ""),
          endText: calendarDateText(version.endDate ?? ""),
        }),
      )
      .sort((a, b) => a.versionNo - b.versionNo);
    return { kind: "ready", agreement, versions: rows };
  }
  switch (result.kind) {
    case "signed-out":
    case "unavailable":
      return { kind: "session" };
    case "network":
      return { kind: "error" };
    case "http":
      if (NOT_FOUND_STATUSES.has(result.status)) return { kind: "not-found" };
      return result.correlationId === undefined ? { kind: "error" } : { kind: "error", correlationId: result.correlationId };
  }
}
