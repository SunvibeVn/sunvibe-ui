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

export function transactionTypeText(code: string): EligibilityKey {
  return textOf(TRANSACTION_TYPE_TEXT, code, "transactionType.OTHER");
}
