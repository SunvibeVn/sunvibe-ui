import type { EligibilityKey } from "./reason-text";

/**
 * The parts a version needs before it is sent (brokerage-agreement S4-D5), by the path an
 * `AGREEMENT_VERSION_INCOMPLETE` entry names (S4-D11), in S4-D5's order.
 */
const PART_TEXT: Readonly<Record<string, EligibilityKey>> = {
  photoConsent: "send.part.photoConsent",
  "terms.monthlyRent": "send.part.monthlyRent",
  "terms.deposit": "send.part.deposit",
  "terms.minimumTermMonths": "send.part.minimumTerm",
  "terms.paymentPeriodMonths": "send.part.paymentPeriod",
  "terms.mandatoryFees": "send.part.mandatoryFees",
  "feePolicy.formula": "send.part.formula",
  "feePolicy.dueDays": "send.part.dueDays",
  "feePolicy.renewal": "send.part.renewal",
  "feePolicy.earlyLeaseEnd": "send.part.earlyLeaseEnd",
  "feePolicy.protectionDays": "send.part.protectionDays",
};

/** The text of a missing part; a part this UI does not know reads "Another part", so it is shown and never dropped. */
export function versionPartText(path: string): EligibilityKey {
  return Object.hasOwn(PART_TEXT, path) ? (PART_TEXT[path] as EligibilityKey) : "send.part.OTHER";
}
