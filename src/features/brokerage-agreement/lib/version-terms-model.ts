import type {
  BrokerageAgreementDeposit,
  BrokerageAgreementFee,
  BrokerageAgreementRent,
  BrokerageAgreementSurveyTerms,
  BrokerageAgreementVersion,
} from "../types";

import { calendarDateText } from "./date-text";
import type { EligibilityKey } from "./reason-text";
import { advertisingScopeText, amountText, chargeUnitText, feeLineKey, termSourceText } from "./terms-text";

/** One message of the `BrokerageAgreement` namespace with its values; a value may itself be a message (a fee's unit). */
export type Phrase = { key: EligibilityKey; values?: Record<string, string | number | Phrase> };

/** The mandatory fees of a version: not stated yet (null), stated none ([]), or one line per fee (BR-8). */
export type FeesContent = { kind: "notStated" } | { kind: "none" } | { kind: "list"; lines: Phrase[] };

/**
 * What the read-only panel shows of one version (brokerage-agreement BR-8, BR-9, S3-D14). A part the answer holds but
 * cannot be read is null: the panel shows no line for it rather than a guess. `advertising` is null when the answer has
 * no scope (a server before E05-S3).
 */
export type VersionContent = {
  proposed: boolean;
  advertising: Phrase | null;
  interior: Phrase;
  exterior: Phrase;
  monthlyRent: Phrase | null;
  deposit: Phrase | null;
  minimumTerm: Phrase | null;
  paymentPeriod: Phrase | null;
  fees: FeesContent;
};

/** One value of the survey reference, with where and when the survey took it (brokerage-agreement S3-D12). */
export type ProposalRow = { labelKey: EligibilityKey; value: Phrase; sourceKey: EligibilityKey; dateText: string };

/** The translator of the `BrokerageAgreement` namespace, as `useTranslations` and `createTranslator` give it. */
export type Translate = (key: EligibilityKey, values?: Record<string, string | number>) => string;

/** The text of a phrase; a value that is itself a phrase is translated first. */
export function phraseText(t: Translate, phrase: Phrase): string {
  if (phrase.values === undefined) return t(phrase.key);
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(phrase.values)) {
    values[name] = typeof value === "object" ? phraseText(t, value) : value;
  }
  return t(phrase.key, values);
}

const NOT_ENTERED: Phrase = { key: "terms.notEntered" };
const NO_DEPOSIT: Phrase = { key: "terms.noDeposit" };

/** A whole number the page can show exactly (every amount and count of the contract is one). */
const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

/** Every amount is VND (ADR-006); another currency cannot be read as one. */
const isVnd = (currency: string | null | undefined) => currency === null || currency === undefined || currency === "VND";

function rentPhrase(rent: BrokerageAgreementRent): Phrase | null {
  if (!isWhole(rent.amount) || !isVnd(rent.currency) || (rent.unit !== undefined && rent.unit !== "MONTH")) return null;
  return { key: "terms.rentValue", values: { amount: amountText(rent.amount) } };
}

/** A deposit in months of rent or as an amount; 0 of either is no deposit (brokerage-agreement BR-8). */
function depositPhrase(deposit: BrokerageAgreementDeposit): Phrase | null {
  const basis: string | undefined = deposit.basis;
  if (basis === undefined) return null;
  if (basis === "MONTHS") {
    if (!isWhole(deposit.months)) return null;
    return deposit.months === 0 ? NO_DEPOSIT : { key: "terms.depositMonths", values: { count: deposit.months } };
  }
  if (basis === "AMOUNT") {
    if (!isWhole(deposit.amount) || !isVnd(deposit.currency)) return null;
    return deposit.amount === 0 ? NO_DEPOSIT : { key: "terms.depositAmount", values: { amount: amountText(deposit.amount) } };
  }
  return { key: "terms.depositOther" };
}

function monthsPhrase(months: number): Phrase | null {
  return isWhole(months) ? { key: "terms.months", values: { count: months } } : null;
}

/** One fee line: a fee without a name or basis, or an amount without its value or unit, cannot be read. */
function feePhrase(fee: BrokerageAgreementFee): Phrase | null {
  const { name, basis } = fee;
  if (name === undefined || name.trim() === "" || basis === undefined) return null;
  if (basis !== "AMOUNT") return { key: feeLineKey(basis), values: { name } };
  if (!isWhole(fee.amount) || !isVnd(fee.currency) || fee.chargeUnit === null || fee.chargeUnit === undefined) return null;
  return {
    key: "terms.fee.AMOUNT",
    values: { name, amount: amountText(fee.amount), unit: { key: chargeUnitText(fee.chargeUnit) } },
  };
}

/** A part as the version holds it: "Not entered yet" when it is null or absent, else its reading. */
function entered<T>(value: T | null | undefined, read: (value: T) => Phrase | null): Phrase | null {
  return value === null || value === undefined ? NOT_ENTERED : read(value);
}

/** A part as the survey holds it: nothing when it is null or absent, else its reading. */
function held<T>(value: T | null | undefined, read: (value: T) => Phrase | null): Phrase | null {
  return value === null || value === undefined ? null : read(value);
}

function consentPhrase(consent: boolean | null | undefined): Phrase {
  if (consent === true) return { key: "terms.yes" };
  if (consent === false) return { key: "terms.no" };
  return { key: "terms.notAnswered" };
}

function feesContent(fees: BrokerageAgreementFee[] | null | undefined): FeesContent {
  if (fees === null || fees === undefined) return { kind: "notStated" };
  if (fees.length === 0) return { kind: "none" };
  return { kind: "list", lines: fees.map(feePhrase).filter((line): line is Phrase => line !== null) };
}

/**
 * The content of one version as the panel shows it (brokerage-agreement BR-8, BR-9, S3-D13, S4-D15): a version the
 * owner has not answered yet (DRAFT, or AWAITING_OWNER once sent) is proposed terms the owner has not confirmed; photo
 * consent of the interior answered or not, the exterior yes or no (no by default, BR-12); each term or "Not entered
 * yet"; the fees not stated, none, or one line each.
 */
export function versionContent(version: BrokerageAgreementVersion): VersionContent {
  const terms = version.terms ?? {};
  return {
    proposed: version.status === "DRAFT" || version.status === "AWAITING_OWNER",
    advertising: version.advertisingScope === undefined ? null : { key: advertisingScopeText(version.advertisingScope) },
    interior: consentPhrase(version.photoConsent),
    exterior: { key: version.exteriorPhotoConsent === true ? "terms.yes" : "terms.no" },
    monthlyRent: entered(terms.monthlyRent, rentPhrase),
    deposit: entered(terms.deposit, depositPhrase),
    minimumTerm: entered(terms.minimumTermMonths, monthsPhrase),
    paymentPeriod: entered(terms.paymentPeriodMonths, monthsPhrase),
    fees: feesContent(terms.mandatoryFees),
  };
}

/**
 * The survey reference as rows (brokerage-agreement S3-D11 to S3-D13): each part the proposal holds and the page can
 * read, in the order of the terms, with its source text and its date. The proposal is never stored.
 */
export function proposalRows(proposal: BrokerageAgreementSurveyTerms): ProposalRow[] {
  const terms = proposal.terms ?? {};
  const sources = proposal.sources ?? [];
  const row = (field: string, labelKey: EligibilityKey, value: Phrase | null): ProposalRow[] => {
    if (value === null) return [];
    const source = sources.find((entry) => entry.field === field);
    return [{ labelKey, value, sourceKey: termSourceText(source?.source), dateText: calendarDateText(source?.date ?? "") }];
  };
  return [
    ...row("monthlyRent", "terms.monthlyRent", held(terms.monthlyRent, rentPhrase)),
    ...row("deposit", "terms.deposit", held(terms.deposit, depositPhrase)),
    ...row("minimumTermMonths", "terms.minimumTerm", held(terms.minimumTermMonths, monthsPhrase)),
    ...row("paymentPeriodMonths", "terms.paymentPeriod", held(terms.paymentPeriodMonths, monthsPhrase)),
    ...(terms.mandatoryFees ?? []).flatMap((fee, index) =>
      row(`mandatoryFees[${index}]`, "terms.mandatoryFees", feePhrase(fee)),
    ),
  ];
}
