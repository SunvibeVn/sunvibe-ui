import { feePolicySchema, MAX_TIERS } from "../schemas/fee-policy.schema";
import type {
  BrokerageAgreementEarlyLeaseEndInput,
  BrokerageAgreementFeeFormula,
  BrokerageAgreementFeeFormulaInput,
  BrokerageAgreementFeePolicy,
  BrokerageAgreementFeePolicyInput,
  EarlyLeaseEndType,
  FeeFormulaType,
} from "../types";

import type { EligibilityKey } from "./reason-text";

export { MAX_TIERS };

/** The two places a formula sits: the fee, and the fee of a renewal with the same tenant. */
export type FormulaPart = "formula" | "renewal";

/** How a fee is set as chosen; `""` is not entered yet. */
export type FormulaKind = "" | FeeFormulaType;

/** One tier as typed: numbers as text, `""` when empty. */
export type TierValues = { fromMonths: string; percent: string };

/** One formula as typed: only the chosen kind's fields hold a value (setFormulaKind clears the others). */
export type FormulaValues = { kind: FormulaKind; tiers: TierValues[]; amount: string; freeReason: string };

export type EarlyLeaseEndValues = { kind: "" | EarlyLeaseEndType; refundPercent: string; withinMonths: string };

/**
 * The values of the fee section of the draft edit form (brokerage-agreement BR-7, S4-D14), kept in React state beside
 * the E05-S3 values: numbers as the digits typed, `""` for a part not entered yet. Never stored (BR-17).
 */
export type FeePolicyValues = {
  formula: FormulaValues;
  dueDays: string;
  renewal: FormulaValues;
  earlyLeaseEnd: EarlyLeaseEndValues;
  protectionDays: string;
};

/** The kinds each place takes, in the order of S4-D3 (the server refuses another with the place's list). */
export const FORMULA_KINDS = ["PERCENT_OF_RENT", "FIXED_AMOUNT", "FREE"] as const satisfies readonly FeeFormulaType[];
export const RENEWAL_KINDS = ["NOT_CHARGED", "PERCENT_OF_RENT", "FIXED_AMOUNT"] as const satisfies readonly FeeFormulaType[];
export const EARLY_LEASE_END_KINDS = ["NO_REFUND", "PARTIAL_REFUND"] as const satisfies readonly EarlyLeaseEndType[];

const KINDS_OF: Record<FormulaPart, readonly FeeFormulaType[]> = { formula: FORMULA_KINDS, renewal: RENEWAL_KINDS };

const EMPTY_FORMULA: FormulaValues = { kind: "", tiers: [], amount: "", freeReason: "" };
const EMPTY_EARLY_LEASE_END: EarlyLeaseEndValues = { kind: "", refundPercent: "", withinMonths: "" };

/** Nothing entered: no part has a default (brokerage-agreement BR-7, S4-D3: no standard rate). */
export const EMPTY_FEE_POLICY: FeePolicyValues = {
  formula: EMPTY_FORMULA,
  dueDays: "",
  renewal: EMPTY_FORMULA,
  earlyLeaseEnd: EMPTY_EARLY_LEASE_END,
  protectionDays: "",
};

/** The first tier starts at a lease term of 1 month and cannot be changed (brokerage-agreement BR-7). */
const FIRST_START = "1";

export type FeePolicyProblem =
  | "percent"
  | "tierStart"
  | "tierOrder"
  | "tooManyTiers"
  | "fixedAmount"
  | "freeReason"
  | "freeReasonCharacters"
  | "dueDays"
  | "protectionDays"
  | "refundPercent"
  | "withinMonths";

type TierField = "fromMonths" | "percent";

export type FeePolicyField =
  | `${FormulaPart}.tiers`
  | `${FormulaPart}.tiers.${number}.${TierField}`
  | `${FormulaPart}.amount`
  | "formula.freeReason"
  | "dueDays"
  | "earlyLeaseEnd.refundPercent"
  | "earlyLeaseEnd.withinMonths"
  | "protectionDays";

export type FeePolicyErrors = Partial<Record<FeePolicyField, FeePolicyProblem>>;

// `Record` over each problem: a problem without a text fails `npm run typecheck`.
const PROBLEM_TEXT: Record<FeePolicyProblem, EligibilityKey> = {
  percent: "edit.feePolicy.errors.percent",
  tierStart: "edit.feePolicy.errors.tierStart",
  tierOrder: "edit.feePolicy.errors.tierOrder",
  tooManyTiers: "edit.feePolicy.errors.tooManyTiers",
  fixedAmount: "edit.feePolicy.errors.fixedAmount",
  freeReason: "edit.feePolicy.errors.freeReason",
  freeReasonCharacters: "edit.feePolicy.errors.freeReasonCharacters",
  dueDays: "edit.feePolicy.errors.dueDays",
  protectionDays: "edit.feePolicy.errors.protectionDays",
  refundPercent: "edit.feePolicy.errors.refundPercent",
  withinMonths: "edit.feePolicy.errors.withinMonths",
};

/** The text of a problem of the fee section. */
export function feePolicyProblemKey(problem: FeePolicyProblem): EligibilityKey {
  return PROBLEM_TEXT[problem];
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
const digits = (value: number | null | undefined) => (isWhole(value) ? String(value) : "");

function formulaValuesOf(formula: BrokerageAgreementFeeFormula | null | undefined, part: FormulaPart): FormulaValues {
  const type = formula?.type;
  // A type the form cannot hold in this place reads as not entered.
  if (formula === null || formula === undefined || type === undefined || !KINDS_OF[part].includes(type)) return EMPTY_FORMULA;
  switch (type) {
    case "PERCENT_OF_RENT":
      return {
        ...EMPTY_FORMULA,
        kind: type,
        tiers: (formula.tiers ?? []).slice(0, MAX_TIERS).map((tier, index) => ({
          fromMonths: index === 0 ? FIRST_START : digits(tier.fromMonths),
          percent: digits(tier.percent),
        })),
      };
    case "FIXED_AMOUNT":
      return { ...EMPTY_FORMULA, kind: type, amount: digits(formula.amount) };
    case "FREE":
      return { ...EMPTY_FORMULA, kind: type, freeReason: formula.freeReason ?? "" };
    case "NOT_CHARGED":
      return { ...EMPTY_FORMULA, kind: type };
  }
}

/** The section's first values: the draft's fee policy as the page read it; a part not entered reads `""`. */
export function feePolicyValuesOf(feePolicy?: BrokerageAgreementFeePolicy | null): FeePolicyValues {
  if (feePolicy === null || feePolicy === undefined) return EMPTY_FEE_POLICY;
  const early = feePolicy.earlyLeaseEnd;
  let earlyLeaseEnd = EMPTY_EARLY_LEASE_END;
  if (early?.type === "NO_REFUND") earlyLeaseEnd = { ...EMPTY_EARLY_LEASE_END, kind: "NO_REFUND" };
  else if (early?.type === "PARTIAL_REFUND") {
    earlyLeaseEnd = { kind: "PARTIAL_REFUND", refundPercent: digits(early.refundPercent), withinMonths: digits(early.withinMonths) };
  }
  return {
    formula: formulaValuesOf(feePolicy.formula, "formula"),
    dueDays: digits(feePolicy.dueDays),
    renewal: formulaValuesOf(feePolicy.renewal, "renewal"),
    earlyLeaseEnd,
    protectionDays: digits(feePolicy.protectionDays),
  };
}

/**
 * Another way of setting the fee: only the chosen kind's fields stay, so a hidden value never reaches the body; a
 * percentage starts with one tier from a term of 1 month. The same kind again keeps what is typed.
 */
export function setFormulaKind(values: FeePolicyValues, part: FormulaPart, kind: FormulaKind): FeePolicyValues {
  if (values[part].kind === kind) return values;
  const tiers = kind === "PERCENT_OF_RENT" ? [{ fromMonths: FIRST_START, percent: "" }] : [];
  return { ...values, [part]: { ...EMPTY_FORMULA, kind, tiers } };
}

/** The fixed amount or the reason of a formula, as typed. */
export function setFormulaValue(
  values: FeePolicyValues,
  part: FormulaPart,
  field: "amount" | "freeReason",
  value: string,
): FeePolicyValues {
  return { ...values, [part]: { ...values[part], [field]: value } };
}

/** One tier changed; the first tier's start stays at 1. */
export function setTier(values: FeePolicyValues, part: FormulaPart, index: number, patch: Partial<TierValues>): FeePolicyValues {
  const tiers = values[part].tiers.map((tier, at) => {
    if (at !== index) return tier;
    const next = { ...tier, ...patch };
    return at === 0 ? { ...next, fromMonths: FIRST_START } : next;
  });
  return { ...values, [part]: { ...values[part], tiers } };
}

/** One more tier, up to five (brokerage-agreement BR-7). */
export function addTier(values: FeePolicyValues, part: FormulaPart): FeePolicyValues {
  const { tiers } = values[part];
  if (tiers.length >= MAX_TIERS) return values;
  return { ...values, [part]: { ...values[part], tiers: [...tiers, { fromMonths: "", percent: "" }] } };
}

/** One tier fewer; the first tier stays. */
export function removeTier(values: FeePolicyValues, part: FormulaPart, index: number): FeePolicyValues {
  if (index === 0) return values;
  return { ...values, [part]: { ...values[part], tiers: values[part].tiers.filter((_, at) => at !== index) } };
}

/** Another refund rule on an early lease end: the refund's values go with a kind that has none. */
export function setEarlyLeaseEndKind(values: FeePolicyValues, kind: EarlyLeaseEndValues["kind"]): FeePolicyValues {
  if (values.earlyLeaseEnd.kind === kind) return values;
  return { ...values, earlyLeaseEnd: { ...EMPTY_EARLY_LEASE_END, kind } };
}

/**
 * The client checks of the fee section (brokerage-agreement BR-7, E-13, S4-D3), as the server checks them, by
 * `feePolicySchema`. The first problem of each field; `{}` when the section can be sent.
 */
export function checkFeePolicy(values: FeePolicyValues): FeePolicyErrors {
  const result = feePolicySchema.safeParse(values);
  if (result.success) return {};
  const errors: FeePolicyErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join(".") as FeePolicyField;
    if (Object.hasOwn(PROBLEM_TEXT, issue.message) && errors[field] === undefined) {
      errors[field] = issue.message as FeePolicyProblem;
    }
  }
  return errors;
}

const numberOrNull = (value: string): number | null => (value === "" ? null : Number(value));

function formulaBody(formula: FormulaValues): BrokerageAgreementFeeFormulaInput | null {
  if (formula.kind === "") return null;
  // Every field is sent, the other kinds' as null, in the order of the contract's example.
  const only: BrokerageAgreementFeeFormulaInput = {
    type: formula.kind,
    tiers: null,
    amount: null,
    currency: null,
    freeReason: null,
  };
  switch (formula.kind) {
    case "PERCENT_OF_RENT":
      return {
        ...only,
        tiers: formula.tiers.map((tier) => ({ fromMonths: Number(tier.fromMonths), percent: Number(tier.percent) })),
      };
    case "FIXED_AMOUNT":
      return { ...only, amount: Number(formula.amount), currency: "VND" };
    case "FREE":
      return { ...only, freeReason: formula.freeReason.trim() };
    case "NOT_CHARGED":
      return only;
  }
}

function earlyLeaseEndBody(earlyLeaseEnd: EarlyLeaseEndValues): BrokerageAgreementEarlyLeaseEndInput | null {
  if (earlyLeaseEnd.kind === "") return null;
  if (earlyLeaseEnd.kind === "NO_REFUND") return { type: "NO_REFUND", refundPercent: null, withinMonths: null };
  return {
    type: "PARTIAL_REFUND",
    refundPercent: Number(earlyLeaseEnd.refundPercent),
    withinMonths: Number(earlyLeaseEnd.withinMonths),
  };
}

/**
 * The fee policy part of the whole-draft PUT (brokerage-agreement S4-D1, spec section 4): always an object, each part
 * null when not entered. Amounts are whole VND typed as digits, sent as exact JSON integers with currency VND (ADR-006);
 * the reason is sent trimmed.
 */
export function feePolicyBody(values: FeePolicyValues): BrokerageAgreementFeePolicyInput {
  return {
    formula: formulaBody(values.formula),
    dueDays: numberOrNull(values.dueDays),
    renewal: formulaBody(values.renewal),
    earlyLeaseEnd: earlyLeaseEndBody(values.earlyLeaseEnd),
    protectionDays: numberOrNull(values.protectionDays),
  };
}
