import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementDetail, BrokerageAgreementVersion } from "../types";

import { calendarDateText } from "./date-text";
import { type FeePolicyView, feePolicyModel } from "./fee-policy-model";
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

/**
 * The owner's answer to a sent version as the staff page shows it (brokerage-agreement E05-S5, S5-D13): until when the
 * owner may answer, when they confirmed or declined it (with their private reason, BR-17: staff who may read the
 * agreement see it), or by when they did not answer. `time` is an instant in UTC.
 */
export type VersionAnswer = {
  kind: "awaiting" | "confirmed" | "rejected" | "lapsed";
  time: string;
  reasonOrNull: string | null;
};

/**
 * One version of the agreement, its dates as calendar dates, its content (brokerage-agreement E05-S3), its fee policy,
 * when it was sent to the owner (E05-S4: an instant in UTC, null for a version never sent) and the owner's answer
 * (E05-S5: null for a version without one).
 */
export type VersionRow = {
  versionNo: number;
  statusKey: EligibilityKey;
  startText: string;
  endText: string;
  content: VersionContent;
  fee: FeePolicyView;
  sentAt: string | null;
  answer: VersionAnswer | null;
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
      /**
       * "Open a new draft": the viewer is the assigned Sale, the agreement is drafting, the answer has a data version and
       * no pending version (none DRAFT, AWAITING_OWNER, OWNER_CONFIRMED or ACTIVATED): the owner declined the last one or
       * did not answer in time (brokerage-agreement BR-5, S5-D10). A hint only: the server decides.
       */
      canOpenDraft: boolean;
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

/** The versions that keep a new draft from being opened: one still pending, or one in effect (BR-5, S5-D10). */
const PENDING_STATUSES: ReadonlySet<string> = new Set(["DRAFT", "AWAITING_OWNER", "OWNER_CONFIRMED", "ACTIVATED"]);

const present = (value: string | null | undefined): value is string => typeof value === "string" && value !== "";

/**
 * The owner's answer line of a version, from the effective state the detail answers (brokerage-agreement S5-D8, S5-D13):
 * the deadline while waiting or once lapsed, the answer's time once confirmed or declined; none for any other state or
 * when that time is absent. No time is compared with the browser's clock (S5-D19 (5)).
 */
function answerOf(version: BrokerageAgreementVersion): VersionAnswer | null {
  const { status, answerBy, ownerAnsweredAt } = version;
  if (status === "AWAITING_OWNER" && present(answerBy)) return { kind: "awaiting", time: answerBy, reasonOrNull: null };
  if (status === "LAPSED" && present(answerBy)) return { kind: "lapsed", time: answerBy, reasonOrNull: null };
  if (status === "OWNER_CONFIRMED" && present(ownerAnsweredAt)) {
    return { kind: "confirmed", time: ownerAnsweredAt, reasonOrNull: null };
  }
  if (status === "OWNER_REJECTED" && present(ownerAnsweredAt)) {
    return { kind: "rejected", time: ownerAnsweredAt, reasonOrNull: version.ownerRejectionReason ?? null };
  }
  return null;
}

/**
 * Turns the detail answer into the page's model (brokerage-agreement E05-S2, spec section 6), by kind and status, never
 * by message: 200 → the header, the versions by number with their content and the owner's answer (E05-S5), whether the
 * viewer may edit the draft (E05-S3) or open a new one (E05-S5); 404 and 403 → not available; any other failure → a
 * retry with its support code; no session → the session screens.
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
      .map((version): VersionRow => {
        const content = versionContent(version);
        return {
          versionNo: version.versionNo ?? 0,
          statusKey: versionStatusText(version.status ?? ""),
          startText: calendarDateText(version.startDate ?? ""),
          endText: calendarDateText(version.endDate ?? ""),
          content,
          // Both panels read one "proposed" flag (brokerage-agreement S4-D15, E05S4-P4).
          fee: feePolicyModel(version.feePolicy, content.proposed),
          sentAt: version.sentAt ?? null,
          answer: answerOf(version),
        };
      })
      .sort((a, b) => a.versionNo - b.versionNo);
    const knownVersion = dataVersion ?? null;
    const pending = draftOf(versions ?? []);
    const canEditDraft =
      viewerIsAssignedSale === true && status === "DRAFTING" && knownVersion !== null && pending !== null;
    const canOpenDraft =
      viewerIsAssignedSale === true &&
      status === "DRAFTING" &&
      knownVersion !== null &&
      !(versions ?? []).some((version) => PENDING_STATUSES.has(version.status ?? ""));
    return {
      kind: "ready",
      agreement,
      versions: rows,
      dataVersion: knownVersion,
      canEditDraft,
      canOpenDraft,
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
