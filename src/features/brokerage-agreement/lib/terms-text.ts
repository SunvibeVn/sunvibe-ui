import type { AdvertisingScope, ChargeUnit, FeeBasis, TermSourceCode } from "../types";

import type { EligibilityKey } from "./reason-text";

// `Record` over each generated union: a code without a text fails `npm run typecheck` (brokerage-agreement BR-8, BR-9).

const CHARGE_UNIT_TEXT: Record<ChargeUnit, EligibilityKey> = {
  PER_MONTH: "terms.chargeUnit.PER_MONTH",
  PER_KWH: "terms.chargeUnit.PER_KWH",
  PER_M3: "terms.chargeUnit.PER_M3",
  PER_PERSON_PER_MONTH: "terms.chargeUnit.PER_PERSON_PER_MONTH",
  PER_VEHICLE_PER_MONTH: "terms.chargeUnit.PER_VEHICLE_PER_MONTH",
  ONE_OFF: "terms.chargeUnit.ONE_OFF",
};

const FEE_LINE: Record<FeeBasis, EligibilityKey> = {
  AMOUNT: "terms.fee.AMOUNT",
  INCLUDED: "terms.fee.INCLUDED",
  PROVIDER_TARIFF: "terms.fee.PROVIDER_TARIFF",
};

const TERM_SOURCE_TEXT: Record<TermSourceCode, EligibilityKey> = {
  OBSERVED_ON_SITE: "survey.source.OBSERVED_ON_SITE",
  OWNER_STATED: "survey.source.OWNER_STATED",
  OWNER_FORM: "survey.source.OWNER_FORM",
};

const ADVERTISING_SCOPE_TEXT: Record<AdvertisingScope, EligibilityKey> = {
  SUNVIBE_CHANNELS: "terms.advertisingScope.SUNVIBE_CHANNELS",
};

/** The text of a code in `table`, or `other` for a code this UI does not know, so it is shown and never dropped. */
function textOf(table: Readonly<Record<string, EligibilityKey>>, code: string, other: EligibilityKey): EligibilityKey {
  return Object.hasOwn(table, code) ? (table[code] as EligibilityKey) : other;
}

/** The charge unit of a fee amount: "per kWh". */
export function chargeUnitText(code: string): EligibilityKey {
  return textOf(CHARGE_UNIT_TEXT, code, "terms.chargeUnit.OTHER");
}

/** The line of one mandatory fee by its basis; its values are `name`, and `amount` and `unit` for an amount. */
export function feeLineKey(basis: string): EligibilityKey {
  return textOf(FEE_LINE, basis, "terms.fee.OTHER");
}

/** Where the survey took a value from (brokerage-agreement S3-D12); none recorded reads "Source not recorded". */
export function termSourceText(codeOrNull: string | null | undefined): EligibilityKey {
  if (codeOrNull === null || codeOrNull === undefined) return "survey.source.none";
  return textOf(TERM_SOURCE_TEXT, codeOrNull, "survey.source.OTHER");
}

/** The advertising permission of a version (brokerage-agreement BR-9, S3-D6) as its statement. */
export function advertisingScopeText(code: string): EligibilityKey {
  return textOf(ADVERTISING_SCOPE_TEXT, code, "terms.advertisingScope.OTHER");
}

const WHOLE_VND = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * A whole amount of VND with comma groups: "8,000,000" (ADR-006). Every amount of the contract is below 2^53, so the
 * number is exact.
 */
export function amountText(amount: number): string {
  return WHOLE_VND.format(amount);
}
