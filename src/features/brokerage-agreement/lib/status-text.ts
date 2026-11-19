import type { AgreementStatus, BrokerageAgreementDetail, VersionStatus } from "../types";

import type { EligibilityKey } from "./reason-text";

type TransactionType = NonNullable<BrokerageAgreementDetail["transactionType"]>;

// `Record` over each generated union: a code without a text fails `npm run typecheck` (brokerage-agreement BR-5, S2-D4).

const AGREEMENT_STATUS_TEXT: Record<AgreementStatus, EligibilityKey> = {
  DRAFTING: "status.DRAFTING",
  AWAITING_CONFIRMATION: "status.AWAITING_CONFIRMATION",
  ACTIVE: "status.ACTIVE",
  SUSPENDED: "status.SUSPENDED",
  EXPIRED: "status.EXPIRED",
  TERMINATED: "status.TERMINATED",
  CANCELLED: "status.CANCELLED",
};

const VERSION_STATUS_TEXT: Record<VersionStatus, EligibilityKey> = {
  DRAFT: "versionStatus.DRAFT",
  AWAITING_OWNER: "versionStatus.AWAITING_OWNER",
  OWNER_CONFIRMED: "versionStatus.OWNER_CONFIRMED",
  ACTIVATED: "versionStatus.ACTIVATED",
  EFFECTIVE: "versionStatus.EFFECTIVE",
  SUPERSEDED: "versionStatus.SUPERSEDED",
  OWNER_REJECTED: "versionStatus.OWNER_REJECTED",
  LAPSED: "versionStatus.LAPSED",
  ACTIVATION_REFUSED: "versionStatus.ACTIVATION_REFUSED",
  CANCELLED: "versionStatus.CANCELLED",
};

const TRANSACTION_TYPE_TEXT: Record<TransactionType, EligibilityKey> = {
  LONG_TERM_RENT: "transactionType.LONG_TERM_RENT",
};

/** The text of a code in `table`, or `other` for a code this UI does not know, so it is shown and never dropped. */
function textOf(table: Readonly<Record<string, EligibilityKey>>, code: string, other: EligibilityKey): EligibilityKey {
  return Object.hasOwn(table, code) ? (table[code] as EligibilityKey) : other;
}

export function agreementStatusText(code: string): EligibilityKey {
  return textOf(AGREEMENT_STATUS_TEXT, code, "status.OTHER");
}

export function versionStatusText(code: string): EligibilityKey {
  return textOf(VERSION_STATUS_TEXT, code, "versionStatus.OTHER");
}

/** The agreement states that end an EFFECTIVE version with them (brokerage-agreement S8-D3, S8-D16). */
const ENDS_EFFECTIVE_VERSION: ReadonlySet<string> = new Set(["EXPIRED", "TERMINATED"]);

/**
 * Whether a version ended with its agreement (brokerage-agreement S8-D3, S8-D16): an EFFECTIVE version stays EFFECTIVE
 * in the data once its agreement expired or was terminated, so the staff pages read the pair, not the version alone.
 */
export function endedWithAgreement(versionStatus: string | undefined, agreementStatus: string | null | undefined): boolean {
  return versionStatus === "EFFECTIVE" && typeof agreementStatus === "string" && ENDS_EFFECTIVE_VERSION.has(agreementStatus);
}

/**
 * The badge of a version on the staff pages (brokerage-agreement E05-S8, S8-D16, E05S8-P11): an EFFECTIVE version of an
 * EXPIRED or TERMINATED agreement reads "Ended with the agreement"; every other pair, and a version read without its
 * agreement's state, reads the version's own text.
 */
export function versionBadgeText(versionStatus: string, agreementStatus: string | null | undefined): EligibilityKey {
  return endedWithAgreement(versionStatus, agreementStatus) ? "versionStatus.ENDED" : versionStatusText(versionStatus);
}

export function transactionTypeText(code: string): EligibilityKey {
  return textOf(TRANSACTION_TYPE_TEXT, code, "transactionType.OTHER");
}
