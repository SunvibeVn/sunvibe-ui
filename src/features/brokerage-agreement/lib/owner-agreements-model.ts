import type { ApiResult } from "@/features/auth/client";

import type {
  BrokerageAgreementOwnerItem,
  BrokerageAgreementOwnerList,
  BrokerageAgreementStatement,
  BrokerageAgreementVersion,
} from "../types";

import { calendarDateText, vietnamTimeText } from "./date-text";
import { type FeePolicyView, feePolicyModel } from "./fee-policy-model";
import { ownerStatusText } from "./owner-status-text";
import type { EligibilityKey } from "./reason-text";
import { transactionTypeText } from "./status-text";
import { type Phrase, type VersionContent, versionContent } from "./version-terms-model";

/**
 * One sent version as the owner reads it (brokerage-agreement E05-S5, spec section 6): its state with its time in
 * Vietnam time, its period, its terms and fee policy read-only and never "proposed" (the owner is the one who confirms,
 * S5-D17), and, for the version the owner may answer now, the statement to confirm.
 */
export type OwnerVersionModel = {
  versionNo: number;
  state: Phrase;
  startText: string;
  endText: string;
  content: VersionContent;
  fee: FeePolicyView;
  /** The item's AWAITING_OWNER version while the server gives the item a statement (S5-D1, S5-D8). */
  answerable: boolean;
  /** The statement version a confirmation sends back; null unless `answerable`. */
  statementVersion: string | null;
  statementText: string | null;
  /** The owner's own reason for declining the version (BR-17: shown to them); null otherwise or when none was given. */
  reason: string | null;
};

/** One agreement of the owner: its unit, the unit's location when property-service answers it, the type, its versions. */
export type OwnerAgreementModel = {
  agreementId: string;
  unitCode: string | null;
  unit: Phrase;
  /** The unit's location in the property, the street and the ward, each only when known (S5-D2). */
  locationLines: string[];
  transactionTypeKey: EligibilityKey;
  /** The sent versions, newest first. */
  versions: OwnerVersionModel[];
};

/**
 * What the owner's page shows. A signed-out or unavailable session is answered by the session screens, so the page keeps
 * its loading state then.
 */
export type OwnerAgreementsModel =
  | { kind: "loading" }
  | { kind: "error"; correlationId?: string }
  | { kind: "empty" }
  | { kind: "list"; items: OwnerAgreementModel[]; more: boolean };

const present = (value: string | null | undefined): value is string => typeof value === "string" && value.trim() !== "";

/** The statement as a confirmation needs it: both its version and its text, else none. */
function usableStatement(statement: BrokerageAgreementStatement | null | undefined) {
  if (!present(statement?.version) || !present(statement?.text)) return null;
  return { version: statement.version, text: statement.text };
}

/** The time the owner's state text names: the deadline while waiting or once lapsed, the answer's time once answered. */
function stateTime(version: BrokerageAgreementVersion): string | null | undefined {
  switch (version.status) {
    case "AWAITING_OWNER":
    case "LAPSED":
      return version.answerBy;
    case "OWNER_CONFIRMED":
    case "OWNER_REJECTED":
      return version.ownerAnsweredAt;
    default:
      return null;
  }
}

/**
 * The state phrase of a version. A state whose time the answer leaves out reads that Sunvibe is handling the version,
 * never a text with an empty time.
 */
function statePhrase(version: BrokerageAgreementVersion, answerable: boolean): Phrase {
  const key = ownerStatusText(version.status ?? "", answerable);
  const time = stateTime(version);
  if (key === "owner.state.cancelled" || key === "owner.state.handling") return { key };
  return present(time) ? { key, values: { time: vietnamTimeText(time) } } : { key: "owner.state.handling" };
}

function ownerVersion(version: BrokerageAgreementVersion, statement: { version: string; text: string } | null): OwnerVersionModel {
  const answerable = statement !== null;
  return {
    versionNo: version.versionNo ?? 0,
    state: statePhrase(version, answerable),
    startText: calendarDateText(version.startDate ?? ""),
    endText: calendarDateText(version.endDate ?? ""),
    // The shared readings, without their "proposed" line on the owner's own screen (S5-D17, S4-D15).
    content: { ...versionContent(version), proposed: false },
    fee: feePolicyModel(version.feePolicy, false),
    answerable,
    statementVersion: statement?.version ?? null,
    statementText: statement?.text ?? null,
    reason: version.status === "OWNER_REJECTED" && present(version.ownerRejectionReason) ? version.ownerRejectionReason : null,
  };
}

function ownerAgreement(item: BrokerageAgreementOwnerItem): OwnerAgreementModel {
  const unitCode = present(item.unitCode) ? item.unitCode : null;
  const versions = [...(item.versions ?? [])].sort((a, b) => (b.versionNo ?? 0) - (a.versionNo ?? 0));
  const statement = usableStatement(item.statement);
  // The statement belongs to the item's AWAITING_OWNER version, the latest one if the answer held more.
  const answerableNo = statement === null ? null : versions.find((version) => version.status === "AWAITING_OWNER")?.versionNo;
  return {
    agreementId: item.agreementId ?? "",
    unitCode,
    unit: unitCode === null ? { key: "detail.noCode" } : { key: "owner.unit", values: { code: unitCode } },
    locationLines: [item.unitLocation, item.street, item.wardName].filter(present),
    transactionTypeKey: transactionTypeText(item.transactionType ?? ""),
    versions: versions.map((version) =>
      ownerVersion(version, answerableNo !== undefined && version.versionNo === answerableNo ? statement : null),
    ),
  };
}

/**
 * Turns the owner's read into the page's model (brokerage-agreement E05-S5, S5-D17, spec section 6), by kind and status,
 * never by message: no answer yet → loading; 200 → empty, or the list of agreements with `more`; a failure → an error
 * with its support code; no session → loading, the session screens answer. What the page shows follows the effective
 * states and the statement the server answers; no time is compared with the browser's clock (S5-D19 (5)).
 */
export function ownerAgreementsModel(result: ApiResult<BrokerageAgreementOwnerList> | null): OwnerAgreementsModel {
  if (result === null) return { kind: "loading" };
  if (result.ok) {
    const items = result.data.items ?? [];
    if (items.length === 0) return { kind: "empty" };
    return { kind: "list", items: items.map(ownerAgreement), more: result.data.more === true };
  }
  switch (result.kind) {
    case "signed-out":
    case "unavailable":
      return { kind: "loading" };
    case "network":
      return { kind: "error" };
    case "http":
      return result.correlationId === undefined ? { kind: "error" } : { kind: "error", correlationId: result.correlationId };
  }
}
