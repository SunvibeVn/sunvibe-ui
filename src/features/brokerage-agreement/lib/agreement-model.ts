import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementDetail, BrokerageAgreementVersion, BrokerageAgreementVersionActivation } from "../types";

import { type ActivationModel, activationModel } from "./activation-model";
import { type AdvertisingModel, advertisingModel } from "./advertising-model";
import { calendarDateText } from "./date-text";
import { type FeePolicyView, feePolicyModel } from "./fee-policy-model";
import type { EligibilityKey } from "./reason-text";
import { agreementStatusText, endedWithAgreement, transactionTypeText, versionBadgeText } from "./status-text";
import { type StopModel, stopModel } from "./stop-model";
import { type Phrase, type VersionContent, versionContent } from "./version-terms-model";

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
 * agreement see it), or by when they did not answer; or, for a version the owner confirmed and no manager activated in
 * 14 days, by when it was not activated (E05-S6, S6-D5). `time` is an instant in UTC.
 */
export type VersionAnswer = {
  kind: "awaiting" | "confirmed" | "rejected" | "lapsed" | "notActivated";
  time: string;
  reasonOrNull: string | null;
};

/**
 * A manager's activation decision on a version as the staff page shows it (brokerage-agreement E05-S6, S6-D3, S6-D4,
 * S6-D21). `first` (activated, with its start date, or in effect) and `refusal` (with the reason's text) hold every
 * value of their text but the time, which the list adds from `decidedAt` (an instant in UTC); both are null when the
 * answer holds no `decidedAt`, so no line has an empty time. `document` names the signed document's four values;
 * `note` the refusal's note when it is not blank. Private values (BR-17): shown only on the staff page, as text.
 */
export type VersionActivationLines = {
  decidedAt: string | null;
  first: Phrase | null;
  document: Phrase | null;
  refusal: Phrase | null;
  note: string | null;
};

/**
 * One version of the agreement, its dates as calendar dates, its content (brokerage-agreement E05-S3), its fee policy,
 * when it was sent to the owner (E05-S4: an instant in UTC, null for a version never sent) and the owner's answer
 * (E05-S5: null for a version without one). `activation` (E05-S6) is set only when the answer holds the version's
 * activation decision.
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
  activation?: VersionActivationLines;
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
       * no pending version (none DRAFT, AWAITING_OWNER, OWNER_CONFIRMED or ACTIVATED): the latest version did not take
       * effect, and its line in the list says why (brokerage-agreement BR-5, S5-D10, S6-D24). A hint only: the server
       * decides.
       */
      canOpenDraft: boolean;
      /** The DRAFT version as the answer holds it, the edit form's first values (E05S3-P7); null unless `canEditDraft`. */
      draft: BrokerageAgreementVersion | null;
      /** Whether Sunvibe may advertise the unit now (E05-S6, S6-D7); set only when the answer holds `advertising`. */
      advertising?: AdvertisingModel;
      /** The activation section or the waiting line (E05-S6, S6-D8, S6-D22); set only when there is one to show. */
      activation?: ActivationModel;
      /**
       * The stop section (E05-S8, spec section 6, S8-D11): set only when the answer holds an action for the viewer, an
       * end or a suspension record.
       */
      stop?: StopModel;
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
 * when that time is absent. A lapsed version with `activateBy` is one the owner confirmed and no manager activated in 14
 * days (S6-D5, S6-D19): its line names that deadline; one without it keeps the owner's 7-day deadline. No time is
 * compared with the browser's clock (S5-D19 (5)).
 */
function answerOf(version: BrokerageAgreementVersion): VersionAnswer | null {
  const { status, answerBy, ownerAnsweredAt, activateBy } = version;
  if (status === "AWAITING_OWNER" && present(answerBy)) return { kind: "awaiting", time: answerBy, reasonOrNull: null };
  if (status === "LAPSED" && present(activateBy)) return { kind: "notActivated", time: activateBy, reasonOrNull: null };
  if (status === "LAPSED" && present(answerBy)) return { kind: "lapsed", time: answerBy, reasonOrNull: null };
  if (status === "OWNER_CONFIRMED" && present(ownerAnsweredAt)) {
    return { kind: "confirmed", time: ownerAnsweredAt, reasonOrNull: null };
  }
  if (status === "OWNER_REJECTED" && present(ownerAnsweredAt)) {
    return { kind: "rejected", time: ownerAnsweredAt, reasonOrNull: version.ownerRejectionReason ?? null };
  }
  return null;
}

/** The text of a refusal's reason type: the dialog's choice texts, "Another reason" for a type this UI does not know. */
function refusalReason(type: string | null | undefined): Phrase {
  if (type === "DOCUMENT_DIFFERS") return { key: "activation.refusal.DOCUMENT_DIFFERS" };
  if (type === "SIGNER_NOT_OWNER") return { key: "activation.refusal.SIGNER_NOT_OWNER" };
  return { key: "versionActivation.reasonOther" };
}

/**
 * The activation lines of a version (brokerage-agreement E05-S6, S6-D3, S6-D4, S6-D22): activated with its start date,
 * or in effect, from its state; an EFFECTIVE version of an EXPIRED or TERMINATED agreement was in effect until the
 * agreement ended (E05-S8, S8-D16, E05S8-P11); the signed document's number, date and Sunvibe's signatory for an
 * activation; the reason and the note for a refusal. A line whose time or value the answer leaves out is not shown.
 */
function activationLines(
  version: BrokerageAgreementVersion,
  activation: BrokerageAgreementVersionActivation,
  agreementStatus: string | undefined,
): VersionActivationLines {
  const decidedAt = present(activation.decidedAt) ? activation.decidedAt : null;
  const { documentNumber, signedOn, sunvibeSignatoryName, sunvibeSignatoryTitle, refusalNote } = activation;
  let first: Phrase | null = null;
  if (decidedAt !== null && version.status === "ACTIVATED") {
    first = { key: "versionActivation.activated", values: { date: calendarDateText(version.startDate ?? "") } };
  } else if (decidedAt !== null && version.status === "EFFECTIVE") {
    first = endedWithAgreement(version.status, agreementStatus)
      ? { key: "versionActivation.ended" }
      : { key: "versionActivation.effective" };
  }
  const document: Phrase | null =
    activation.decision === "ACTIVATED" &&
    present(documentNumber) &&
    present(signedOn) &&
    present(sunvibeSignatoryName) &&
    present(sunvibeSignatoryTitle)
      ? {
          key: "versionActivation.document",
          values: {
            number: documentNumber,
            date: calendarDateText(signedOn),
            name: sunvibeSignatoryName,
            title: sunvibeSignatoryTitle,
          },
        }
      : null;
  const refused = activation.decision === "REFUSED";
  return {
    decidedAt,
    first,
    document,
    refusal:
      refused && decidedAt !== null
        ? { key: "versionActivation.refused", values: { reason: refusalReason(activation.refusalType) } }
        : null,
    note: refused && present(refusalNote) && refusalNote.trim() !== "" ? refusalNote : null,
  };
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
        const row: VersionRow = {
          versionNo: version.versionNo ?? 0,
          statusKey: versionBadgeText(version.status ?? "", status),
          startText: calendarDateText(version.startDate ?? ""),
          endText: calendarDateText(version.endDate ?? ""),
          content,
          // Both panels read one "proposed" flag (brokerage-agreement S4-D15, E05S4-P4).
          fee: feePolicyModel(version.feePolicy, content.proposed),
          sentAt: version.sentAt ?? null,
          answer: answerOf(version),
        };
        // The key only when the answer holds the decision, so an answer of today gives today's row (S6-D8).
        if (version.activation !== null && version.activation !== undefined) {
          row.activation = activationLines(version, version.activation, status);
        }
        return row;
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
    const ready: Extract<AgreementModel, { kind: "ready" }> = {
      kind: "ready",
      agreement,
      versions: rows,
      dataVersion: knownVersion,
      canEditDraft,
      canOpenDraft,
      draft: canEditDraft ? pending : null,
    };
    // Each new key only when its source is in the answer, never null or undefined, so an answer without the E05-S6
    // properties gives exactly today's model (S6-D8, S6-D22).
    if (result.data.advertising !== null && result.data.advertising !== undefined) {
      // The ENDED line by the agreement's state (S8-D16); an answer without one reads as an unknown state.
      ready.advertising = advertisingModel(result.data.advertising, status ?? null);
    }
    const activation = activationModel(result.data);
    if (activation !== null) ready.activation = activation;
    // An answer without the E05-S8 properties, or with none set, gives exactly today's model (S8-D11, S6-D8).
    const stop = stopModel(result.data);
    if (stop !== null) ready.stop = stop;
    return ready;
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
