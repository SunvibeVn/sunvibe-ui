import type { BrokerageAgreementEarlyLeaseEnd, BrokerageAgreementFeeFormula, BrokerageAgreementFeePolicy } from "../types";

import { chargedWhenText, earlyLeaseEndText, formulaTypeText, payerText } from "./fee-policy-text";
import { amountText } from "./terms-text";
import type { Phrase } from "./version-terms-model";

/**
 * What the read-only fee panel shows of one version (brokerage-agreement BR-7, S4-D10, S4-D14): the two fixed
 * statements, then each part as its lines, or "Not entered yet". A value the answer holds but cannot be read gives no
 * line (an empty list, or null) rather than a guess; a code this UI does not know reads its `OTHER` text.
 */
export type FeePolicyView = {
  /** The version's terms and fee policy are proposed, not yet confirmed by the owner (S4-D15, E05S4-P4). */
  proposed: boolean;
  payer: Phrase;
  chargedWhen: Phrase;
  formula: Phrase[];
  dueDays: Phrase | null;
  renewal: Phrase[];
  earlyLeaseEnd: Phrase | null;
  protectionDays: Phrase | null;
};

const NOT_ENTERED: Phrase = { key: "terms.notEntered" };

/** A whole number the page can show exactly (every amount, count and percentage of the contract is one). */
const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

const isCount = (value: unknown): value is number => isWhole(value) && value >= 0;

/** Every amount is VND (ADR-006); another currency cannot be read as one. */
const isVnd = (currency: string | null | undefined) => currency === null || currency === undefined || currency === "VND";

/**
 * The lines of how a fee is set (brokerage-agreement BR-7): one line per tier of a percentage of one month's rent, the
 * fixed amount per signed lease, free of charge with its reason, or no fee (a renewal). No fee is computed.
 */
function formulaLines(formula: BrokerageAgreementFeeFormula): Phrase[] {
  const type: string = formula.type ?? "";
  switch (type) {
    case "PERCENT_OF_RENT":
      return (formula.tiers ?? []).flatMap((tier): Phrase[] =>
        isWhole(tier.fromMonths) && isWhole(tier.percent)
          ? [{ key: "fee.line.tier", values: { months: tier.fromMonths, percent: tier.percent } }]
          : [],
      );
    case "FIXED_AMOUNT":
      return isWhole(formula.amount) && isVnd(formula.currency)
        ? [{ key: "fee.line.fixedAmount", values: { amount: amountText(formula.amount) } }]
        : [];
    case "FREE": {
      const reason = formula.freeReason ?? "";
      return [reason === "" ? { key: formulaTypeText(type) } : { key: "fee.line.freeReason", values: { reason } }];
    }
    default:
      return [{ key: formulaTypeText(type) }];
  }
}

/** Days after the lease is signed; 0 is the signing day. */
function duePhrase(days: number): Phrase | null {
  if (!isCount(days)) return null;
  return days === 0 ? { key: "fee.line.dueOnSigning" } : { key: "fee.line.dueDays", values: { count: days } };
}

/** No refund, or the share of the fee paid refunded when the lease ends within some months of its start. */
function earlyLeaseEndPhrase(earlyLeaseEnd: BrokerageAgreementEarlyLeaseEnd): Phrase | null {
  const type: string = earlyLeaseEnd.type ?? "";
  if (type !== "PARTIAL_REFUND") return { key: earlyLeaseEndText(type) };
  const { refundPercent, withinMonths } = earlyLeaseEnd;
  if (!isWhole(refundPercent) || !isWhole(withinMonths)) return null;
  return { key: "fee.line.partialRefund", values: { percent: refundPercent, months: withinMonths } };
}

/** The protection period (brokerage-agreement BR-7): days after this agreement ends; 0 is none. */
function protectionPhrase(days: number): Phrase | null {
  if (!isCount(days)) return null;
  return days === 0 ? { key: "fee.line.noProtection" } : { key: "fee.line.protectionDays", values: { count: days } };
}

function lines<T>(value: T | null | undefined, read: (value: T) => Phrase[]): Phrase[] {
  return value === null || value === undefined ? [NOT_ENTERED] : read(value);
}

function line<T>(value: T | null | undefined, read: (value: T) => Phrase | null): Phrase | null {
  return value === null || value === undefined ? NOT_ENTERED : read(value);
}

/**
 * The fee policy of one version as the panel shows it (brokerage-agreement BR-7, S4-D10, S4-D14). An answer without a
 * fee policy (a version stored before it existed, or a server before E05-S4) reads every part not entered. The payer and
 * the moment are fixed by BR-7 (the owner, when a lease is signed), so they read so when the answer leaves them out.
 * `proposed` is the version row's flag, the one the terms panel reads (S4-D15, E05S4-P4).
 */
export function feePolicyModel(feePolicy: BrokerageAgreementFeePolicy | null | undefined, proposed: boolean): FeePolicyView {
  const policy = feePolicy ?? {};
  return {
    proposed,
    payer: { key: payerText(policy.payer ?? "OWNER") },
    chargedWhen: { key: chargedWhenText(policy.chargedWhen ?? "LEASE_SIGNED") },
    formula: lines(policy.formula, formulaLines),
    dueDays: line(policy.dueDays, duePhrase),
    renewal: lines(policy.renewal, formulaLines),
    earlyLeaseEnd: line(policy.earlyLeaseEnd, earlyLeaseEndPhrase),
    protectionDays: line(policy.protectionDays, protectionPhrase),
  };
}
