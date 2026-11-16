import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementDetail, BrokerageAgreementVersion } from "../types";

import { calendarDateText } from "./date-text";
import type { EligibilityKey } from "./reason-text";
import { agreementStatusText, transactionTypeText, versionStatusText } from "./status-text";
import { type VersionContent, versionContent } from "./version-terms-model";

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

/** One version of the agreement, its dates as calendar dates, and its content (brokerage-agreement E05-S3). */
export type VersionRow = {
  versionNo: number;
  statusKey: EligibilityKey;
  startText: string;
  endText: string;
  content: VersionContent;
};

/** What a read of the agreement leaves on screen. */
export type AgreementModel =
  | { kind: "loading" }
  /** Signed out or unavailable: the session screens answer, the page shows nothing. */
  | { kind: "session" }
  /** Unknown, malformed, not visible (404) or a role that may not read it (403): one text for all. */
  | { kind: "not-found" }
  | { kind: "error"; correlationId?: string }
  | {
      kind: "ready";
      agreement: AgreementHeader;
      versions: VersionRow[];
      /** The data version a save sends back (brokerage-agreement BR-5, S3-D4); null when the answer left it out. */
      dataVersion: number | null;
      /**
       * "Edit the draft": the viewer is the assigned Sale, the agreement is drafting, the answer has a data version and a
       * DRAFT version (brokerage-agreement BR-16, S3-D2). A hint only: the server decides.
       */
      canEditDraft: boolean;
      /** The DRAFT version as the answer holds it, the edit form's first values (E05S3-P7); null unless `canEditDraft`. */
      draft: BrokerageAgreementVersion | null;
    };

/** The workspace page of one agreement. */
export function agreementPath(agreementId: string): string {
  return `/workspace/brokerage-agreements/${agreementId}`;
}

const NOT_FOUND_STATUSES = new Set([403, 404]);

/** The pending draft of the answer: its DRAFT version, the latest one if it held more. */
function draftOf(versions: BrokerageAgreementVersion[]): BrokerageAgreementVersion | null {
  const drafts = versions.filter((version) => version.status === "DRAFT");
  return drafts.reduce<BrokerageAgreementVersion | null>(
    (latest, version) => (latest === null || (version.versionNo ?? 0) > (latest.versionNo ?? 0) ? version : latest),
    null,
  );
}

/**
 * Turns the detail answer into the page's model (brokerage-agreement E05-S2, spec section 6), by kind and status, never
 * by message: 200 → the header, the versions by number with their content, and whether the viewer may edit the draft
 * (E05-S3); 404 and 403 → not available; any other failure → a retry with its support code; no session → the session
 * screens.
 */
export function agreementAfter(result: ApiResult<BrokerageAgreementDetail>): AgreementModel {
  if (result.ok) {
    const { status, transactionType, unitCode, createdAt, basisLeadId, versions, dataVersion, viewerIsAssignedSale } =
      result.data;
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
          content: versionContent(version),
        }),
      )
      .sort((a, b) => a.versionNo - b.versionNo);
    const knownVersion = dataVersion ?? null;
    const pending = draftOf(versions ?? []);
    const canEditDraft =
      viewerIsAssignedSale === true && status === "DRAFTING" && knownVersion !== null && pending !== null;
    return {
      kind: "ready",
      agreement,
      versions: rows,
      dataVersion: knownVersion,
      canEditDraft,
      draft: canEditDraft ? pending : null,
    };
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
