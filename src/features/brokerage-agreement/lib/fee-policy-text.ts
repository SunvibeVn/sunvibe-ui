import type { BrokerageAgreementFeePolicy, EarlyLeaseEndType, FeeFormulaType } from "../types";

import type { EligibilityKey } from "./reason-text";

type Payer = NonNullable<BrokerageAgreementFeePolicy["payer"]>;
type ChargedWhen = NonNullable<BrokerageAgreementFeePolicy["chargedWhen"]>;

// `Record` over each generated union: a code without a text fails `npm run typecheck` (brokerage-agreement BR-7, S4-D3).

const FORMULA_TYPE_TEXT: Record<FeeFormulaType, EligibilityKey> = {
  PERCENT_OF_RENT: "fee.formula.PERCENT_OF_RENT",
  FIXED_AMOUNT: "fee.formula.FIXED_AMOUNT",
  FREE: "fee.formula.FREE",
  NOT_CHARGED: "fee.formula.NOT_CHARGED",
};

const EARLY_LEASE_END_TEXT: Record<EarlyLeaseEndType, EligibilityKey> = {
  NO_REFUND: "fee.earlyLeaseEnd.NO_REFUND",
  PARTIAL_REFUND: "fee.earlyLeaseEnd.PARTIAL_REFUND",
};

const PAYER_TEXT: Record<Payer, EligibilityKey> = { OWNER: "fee.payer.OWNER" };

const CHARGED_WHEN_TEXT: Record<ChargedWhen, EligibilityKey> = { LEASE_SIGNED: "fee.chargedWhen.LEASE_SIGNED" };

/** The text of a code in `table`, or `other` for a code this UI does not know, so it is shown and never dropped. */
function textOf(table: Readonly<Record<string, EligibilityKey>>, code: string, other: EligibilityKey): EligibilityKey {
  return Object.hasOwn(table, code) ? (table[code] as EligibilityKey) : other;
}

/** How a fee is set (brokerage-agreement BR-7): a percentage of one month's rent, a fixed amount, free, or no fee. */
export function formulaTypeText(code: string): EligibilityKey {
  return textOf(FORMULA_TYPE_TEXT, code, "fee.formula.OTHER");
}

/** What happens to the fee paid if the lease ends early: no refund, or a partial refund. */
export function earlyLeaseEndText(code: string): EligibilityKey {
  return textOf(EARLY_LEASE_END_TEXT, code, "fee.earlyLeaseEnd.OTHER");
}

/** Who pays the fee: the owner (brokerage-agreement BR-7, fixed). */
export function payerText(code: string): EligibilityKey {
  return textOf(PAYER_TEXT, code, "fee.payer.OTHER");
}

/** When the fee arises: when a lease is signed (brokerage-agreement BR-7, fixed). */
export function chargedWhenText(code: string): EligibilityKey {
  return textOf(CHARGED_WHEN_TEXT, code, "fee.chargedWhen.OTHER");
}
