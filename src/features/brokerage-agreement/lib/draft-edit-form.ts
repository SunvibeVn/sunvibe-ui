import { draftEditSchema, MAX_FEES } from "../schemas/draft-edit.schema";
import type {
  BrokerageAgreementDraftRequest,
  BrokerageAgreementFee,
  BrokerageAgreementFeeInput,
  BrokerageAgreementSurveyTerms,
  BrokerageAgreementTermsInput,
  BrokerageAgreementVersion,
  ChargeUnit,
} from "../types";

import { type DraftProblem, draftProblems } from "./agreement-draft-form";
import { calendarDateText } from "./date-text";
import type { EligibilityKey } from "./reason-text";
import { termSourceText } from "./terms-text";

export { MAX_FEES };

/** "From the survey: <source>, <date>" beside a part copied from the survey, until it changes (brokerage-agreement S3-D13). */
export type SurveyNote = { sourceKey: EligibilityKey; dateText: string };

/** One mandatory fee as typed: numbers as text, `""` when empty. */
export type FeeRow = {
  name: string;
  basis: "AMOUNT" | "INCLUDED" | "PROVIDER_TARIFF";
  amount: string;
  chargeUnit: ChargeUnit | "";
  fromSurvey: SurveyNote | null;
};

/** The fee list: not stated yet, stated none besides the rent, or these fees (brokerage-agreement BR-8). */
export type FeesValue = { kind: "notStated" } | { kind: "none" } | { kind: "list"; rows: FeeRow[] };

/** The parts a survey value can fill, each with its note. */
type NotedPart = "monthlyRent" | "deposit" | "minimumTermMonths" | "paymentPeriodMonths";

/**
 * The values of the draft edit form (E05S3-P7), kept in React state: dates as `yyyy-mm-dd`, numbers as the digits typed,
 * `""` for a part not entered yet.
 */
export type DraftEditForm = {
  startDate: string;
  endDate: string;
  photoConsent: "yes" | "no" | "unanswered";
  exteriorPhotoConsent: boolean;
  monthlyRent: string;
  depositBasis: "" | "MONTHS" | "AMOUNT";
  depositMonths: string;
  depositAmount: string;
  minimumTermMonths: string;
  paymentPeriodMonths: string;
  fees: FeesValue;
  fromSurvey: Partial<Record<NotedPart, SurveyNote>>;
};

type FeeField = "name" | "basis" | "amount" | "chargeUnit";

export type DraftEditField =
  | "startDate"
  | "endDate"
  | "exteriorPhotoConsent"
  | "monthlyRent"
  | "depositBasis"
  | "depositMonths"
  | "depositAmount"
  | "minimumTermMonths"
  | "paymentPeriodMonths"
  | "fees"
  | `fees.${number}.${FeeField}`;

export type DraftEditProblem =
  | DraftProblem
  | "amount"
  | "depositMonths"
  | "depositAmount"
  | "minimumTerm"
  | "paymentPeriod"
  | "feeName"
  | "feeAmount"
  | "feeUnit"
  | "tooManyFees";

export type DraftEditProblems = Partial<Record<DraftEditField, DraftEditProblem>>;

// `Record` over each problem: a problem without a text fails `npm run typecheck`. The period's texts are the draft
// dialog's (E05S3-P6), so both forms say the same.
const PROBLEM_TEXT: Record<DraftEditProblem, EligibilityKey> = {
  required: "draft.errors.required",
  outOfRange: "draft.errors.outOfRange",
  endBeforeStart: "draft.errors.endBeforeStart",
  tooLong: "draft.errors.tooLong",
  amount: "edit.errors.amount",
  depositMonths: "edit.errors.depositMonths",
  depositAmount: "edit.errors.depositAmount",
  minimumTerm: "edit.errors.minimumTerm",
  paymentPeriod: "edit.errors.paymentPeriod",
  feeName: "edit.errors.feeName",
  feeAmount: "edit.errors.feeAmount",
  feeUnit: "edit.errors.feeUnit",
  tooManyFees: "edit.errors.tooManyFees",
};

/** The text of a problem of the form. */
export function problemKey(problem: DraftEditProblem): EligibilityKey {
  return PROBLEM_TEXT[problem];
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
const digits = (value: number | null | undefined) => (isWhole(value) ? String(value) : "");

const FEE_BASES: readonly string[] = ["AMOUNT", "INCLUDED", "PROVIDER_TARIFF"] satisfies FeeRow["basis"][];

function feeRowOf(fee: BrokerageAgreementFee, fromSurvey: SurveyNote | null): FeeRow | null {
  if (fee.name === undefined || fee.basis === undefined || !FEE_BASES.includes(fee.basis)) return null;
  return {
    name: fee.name,
    basis: fee.basis,
    amount: fee.basis === "AMOUNT" ? digits(fee.amount) : "",
    chargeUnit: fee.basis === "AMOUNT" ? (fee.chargeUnit ?? "") : "",
    fromSurvey,
  };
}

function consentOf(consent: boolean | null | undefined): DraftEditForm["photoConsent"] {
  if (consent === true) return "yes";
  if (consent === false) return "no";
  return "unanswered";
}

/** The form's first values: the draft as the page read it (E05S3-P7). */
export function formFromVersion(version: BrokerageAgreementVersion): DraftEditForm {
  const terms = version.terms ?? {};
  const deposit = terms.deposit ?? null;
  const fees = terms.mandatoryFees;
  let feesValue: FeesValue = { kind: "notStated" };
  if (fees !== null && fees !== undefined) {
    const rows = fees.map((fee) => feeRowOf(fee, null)).filter((fee): fee is FeeRow => fee !== null);
    feesValue = rows.length === 0 ? { kind: "none" } : { kind: "list", rows };
  }
  return {
    startDate: version.startDate ?? "",
    endDate: version.endDate ?? "",
    photoConsent: consentOf(version.photoConsent),
    exteriorPhotoConsent: version.photoConsent === true && version.exteriorPhotoConsent === true,
    monthlyRent: digits(terms.monthlyRent?.amount),
    depositBasis: deposit?.basis === "MONTHS" || deposit?.basis === "AMOUNT" ? deposit.basis : "",
    depositMonths: deposit?.basis === "MONTHS" ? digits(deposit.months) : "",
    depositAmount: deposit?.basis === "AMOUNT" ? digits(deposit.amount) : "",
    minimumTermMonths: digits(terms.minimumTermMonths),
    paymentPeriodMonths: digits(terms.paymentPeriodMonths),
    fees: feesValue,
    fromSurvey: {},
  };
}

/**
 * "Use the survey values" (brokerage-agreement S3-D13): each part the proposal holds replaces that part, with its
 * source and date; the fee list is one part, replaced when the proposal holds a fee; every other part stays as typed.
 * Nothing of the proposal is stored: the Sale's save stores the form.
 */
export function formWithProposal(form: DraftEditForm, proposal: BrokerageAgreementSurveyTerms): DraftEditForm {
  const terms = proposal.terms ?? {};
  const sources = proposal.sources ?? [];
  const noteOf = (field: string): SurveyNote => {
    const source = sources.find((entry) => entry.field === field);
    return { sourceKey: termSourceText(source?.source), dateText: calendarDateText(source?.date ?? "") };
  };
  const next: DraftEditForm = { ...form, fromSurvey: { ...form.fromSurvey } };

  const rent = terms.monthlyRent?.amount;
  if (isWhole(rent)) {
    next.monthlyRent = String(rent);
    next.fromSurvey.monthlyRent = noteOf("monthlyRent");
  }
  const deposit = terms.deposit;
  if (deposit?.basis === "MONTHS" && isWhole(deposit.months)) {
    Object.assign(next, { depositBasis: "MONTHS", depositMonths: String(deposit.months), depositAmount: "" });
    next.fromSurvey.deposit = noteOf("deposit");
  } else if (deposit?.basis === "AMOUNT" && isWhole(deposit.amount)) {
    Object.assign(next, { depositBasis: "AMOUNT", depositMonths: "", depositAmount: String(deposit.amount) });
    next.fromSurvey.deposit = noteOf("deposit");
  }
  for (const part of ["minimumTermMonths", "paymentPeriodMonths"] as const) {
    const months = terms[part];
    if (isWhole(months)) {
      next[part] = String(months);
      next.fromSurvey[part] = noteOf(part);
    }
  }
  const rows = (terms.mandatoryFees ?? [])
    .map((fee, index) => feeRowOf(fee, noteOf(`mandatoryFees[${index}]`)))
    .filter((fee): fee is FeeRow => fee !== null)
    .slice(0, MAX_FEES);
  if (rows.length > 0) next.fees = { kind: "list", rows };
  return next;
}

/** The note each field belongs to: changing the field drops the note. */
const NOTE_OF: Partial<Record<keyof DraftEditForm, NotedPart>> = {
  monthlyRent: "monthlyRent",
  depositBasis: "deposit",
  depositMonths: "deposit",
  depositAmount: "deposit",
  minimumTermMonths: "minimumTermMonths",
  paymentPeriodMonths: "paymentPeriodMonths",
};

/**
 * One field changed: a part copied from the survey loses its note. The exterior consent holds only beside Yes for the
 * interior (brokerage-agreement BR-9, S3-D7): another answer clears it, and it cannot be set without Yes.
 */
export function withValue<K extends keyof DraftEditForm>(form: DraftEditForm, key: K, value: DraftEditForm[K]): DraftEditForm {
  const next: DraftEditForm = { ...form, [key]: value };
  const part = NOTE_OF[key];
  if (part !== undefined && part in form.fromSurvey) {
    next.fromSurvey = { ...form.fromSurvey };
    delete next.fromSurvey[part];
  }
  if (next.photoConsent !== "yes") next.exteriorPhotoConsent = false;
  return next;
}

const rowsOf = (form: DraftEditForm): FeeRow[] => (form.fees.kind === "list" ? form.fees.rows : []);

/** One fee row changed: it loses its survey note. */
export function withFee(form: DraftEditForm, index: number, patch: Partial<Omit<FeeRow, "fromSurvey">>): DraftEditForm {
  const rows = rowsOf(form).map((row, at) => (at === index ? { ...row, ...patch, fromSurvey: null } : row));
  return { ...form, fees: { kind: "list", rows } };
}

const EMPTY_FEE: FeeRow = { name: "", basis: "AMOUNT", amount: "", chargeUnit: "", fromSurvey: null };

/** One more fee row, up to MAX_FEES. */
export function withFeeAdded(form: DraftEditForm): DraftEditForm {
  const rows = rowsOf(form);
  if (form.fees.kind === "list" && rows.length >= MAX_FEES) return form;
  return { ...form, fees: { kind: "list", rows: [...rows, EMPTY_FEE] } };
}

export function withFeeRemoved(form: DraftEditForm, index: number): DraftEditForm {
  return { ...form, fees: { kind: "list", rows: rowsOf(form).filter((_, at) => at !== index) } };
}

/** The form field of a schema issue's path: `fees.rows.<i>.<field>` is the field of fee `i`, `fees.rows` the list. */
function fieldOfIssuePath(path: readonly PropertyKey[]): DraftEditField | null {
  const [first, second, index, field] = path;
  if (first === "fees") {
    if (second !== "rows") return null;
    if (index === undefined) return "fees";
    return typeof index === "number" && typeof field === "string" ? (`fees.${index}.${field}` as DraftEditField) : null;
  }
  return typeof first === "string" && path.length === 1 ? (first as DraftEditField) : null;
}

/**
 * The client checks of the draft (brokerage-agreement BR-6, BR-8, S3-D8), as the server checks them: the period by the
 * draft dialog's rules, the terms by `draftEditSchema`. The first problem of each field; `{}` when the form can be sent.
 */
export function draftEditProblems(form: DraftEditForm): DraftEditProblems {
  const problems: DraftEditProblems = { ...draftProblems(form) };
  const result = draftEditSchema.safeParse(form);
  if (result.success) return problems;
  for (const issue of result.error.issues) {
    const field = fieldOfIssuePath(issue.path);
    if (field !== null && Object.hasOwn(PROBLEM_TEXT, issue.message) && problems[field] === undefined) {
      problems[field] = issue.message as DraftEditProblem;
    }
  }
  return problems;
}

const numberOrNull = (value: string): number | null => (value === "" ? null : Number(value));

function depositOf(form: DraftEditForm): BrokerageAgreementTermsInput["deposit"] {
  if (form.depositBasis === "MONTHS" && form.depositMonths !== "") {
    return { basis: "MONTHS", months: Number(form.depositMonths), amount: null, currency: null };
  }
  if (form.depositBasis === "AMOUNT" && form.depositAmount !== "") {
    return { basis: "AMOUNT", months: null, amount: Number(form.depositAmount), currency: "VND" };
  }
  return null;
}

function feeOf(row: FeeRow): BrokerageAgreementFeeInput {
  const amount = row.basis === "AMOUNT";
  return {
    name: row.name.trim(),
    basis: row.basis,
    amount: amount ? Number(row.amount) : null,
    currency: amount ? "VND" : null,
    chargeUnit: amount && row.chargeUnit !== "" ? row.chargeUnit : null,
  };
}

function feesOf(fees: FeesValue): BrokerageAgreementTermsInput["mandatoryFees"] {
  if (fees.kind === "notStated") return null;
  if (fees.kind === "none") return [];
  return fees.rows.map(feeOf);
}

/**
 * The whole draft (brokerage-agreement S3-D5, spec section 4) with the data version the page read (BR-5): long-term
 * rental, the period, the consent (null = not answered; the exterior only beside Yes), and each term or null when not
 * entered. Amounts are whole VND typed as digits, sent as exact JSON integers with currency VND (ADR-006).
 */
export function draftEditBody(form: DraftEditForm, dataVersion: number): BrokerageAgreementDraftRequest {
  const consent = form.photoConsent;
  return {
    expectedDataVersion: dataVersion,
    transactionType: "LONG_TERM_RENT",
    startDate: form.startDate,
    endDate: form.endDate,
    photoConsent: consent === "unanswered" ? null : consent === "yes",
    exteriorPhotoConsent: consent === "yes" && form.exteriorPhotoConsent,
    terms: {
      monthlyRent: form.monthlyRent === "" ? null : { amount: Number(form.monthlyRent), currency: "VND", unit: "MONTH" },
      deposit: depositOf(form),
      minimumTermMonths: numberOrNull(form.minimumTermMonths),
      paymentPeriodMonths: numberOrNull(form.paymentPeriodMonths),
      mandatoryFees: feesOf(form.fees),
    },
  };
}

const FEE_PATH = /^terms\.mandatoryFees\[(\d+)\]\.(name|basis|amount|currency|chargeUnit)$/;

const SERVER_FIELD: Readonly<Record<string, DraftEditField>> = {
  startDate: "startDate",
  endDate: "endDate",
  exteriorPhotoConsent: "exteriorPhotoConsent",
  "terms.monthlyRent": "monthlyRent",
  "terms.monthlyRent.amount": "monthlyRent",
  "terms.monthlyRent.currency": "monthlyRent",
  "terms.monthlyRent.unit": "monthlyRent",
  "terms.deposit.basis": "depositBasis",
  "terms.deposit.months": "depositMonths",
  "terms.deposit.amount": "depositAmount",
  "terms.deposit.currency": "depositAmount",
  "terms.minimumTermMonths": "minimumTermMonths",
  "terms.paymentPeriodMonths": "paymentPeriodMonths",
  "terms.mandatoryFees": "fees",
};

/**
 * The form field of a `VALIDATION_FAILED` entry (spec section 4: paths relative to the body, Spring's form). A currency
 * marks its amount. Another path marks nothing.
 */
export function fieldOfServerPath(path: string): DraftEditField | null {
  if (Object.hasOwn(SERVER_FIELD, path)) return SERVER_FIELD[path] as DraftEditField;
  const fee = FEE_PATH.exec(path);
  if (fee === null) return null;
  const field = fee[2] === "currency" ? "amount" : (fee[2] as FeeField);
  return `fees.${Number(fee[1])}.${field}`;
}
