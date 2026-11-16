"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useEffect, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";

import { EARLIEST_DATE, LATEST_DATE } from "../lib/agreement-draft-form";
import { type DraftEditOutcome, saveDraft } from "../lib/draft-edit-flow";
import {
  type DraftEditField,
  type DraftEditProblems,
  type DraftEditForm as DraftEditValues,
  draftEditBody,
  draftEditProblems,
  type FeeRow,
  formFromVersion,
  formWithProposal,
  MAX_FEES,
  problemKey,
  type SurveyNote,
  withFee,
  withFeeAdded,
  withFeeRemoved,
  withValue,
} from "../lib/draft-edit-form";
import {
  checkFeePolicy,
  type FeePolicyErrors,
  type FeePolicyValues,
  feePolicyBody,
  feePolicyValuesOf,
} from "../lib/fee-policy-form";
import type { EligibilityKey } from "../lib/reason-text";
import { advertisingScopeText, chargeUnitText } from "../lib/terms-text";
import type { BrokerageAgreementVersion, ChargeUnit } from "../types";

import { FeePolicySection } from "./fee-policy-section";
import { SurveyTermsPanel } from "./survey-terms-panel";

type DraftEditFormProps = {
  agreementId: string;
  /** The data version the page read, sent back as `expectedDataVersion` (brokerage-agreement BR-5, S3-D4). */
  dataVersion: number;
  /** The DRAFT version as the page read it: the form's first values. */
  version: BrokerageAgreementVersion;
  /** A 204: the page leaves edit mode and reads the agreement again. */
  onSaved: () => void;
  /** Cancel: the page leaves edit mode without a read. */
  onCancel: () => void;
  /** "Reload" after a change made meanwhile: the page reads the agreement again and drops the form. */
  onReload: () => void;
};

/** What the last save left on screen: the client checks' problems (the fee section's apart), or the server's answer. */
type EditState = { problems: DraftEditProblems; feeErrors: FeePolicyErrors; outcome: DraftEditOutcome | null; round: number };

const INITIAL: EditState = { problems: {}, feeErrors: {}, outcome: null, round: 0 };

const REFUSAL_TEXT = {
  notDraft: "edit.errors.notDraft",
  stale: "edit.errors.stale",
  notAssignee: "edit.errors.notAssignee",
  notFound: "edit.errors.notFound",
} as const satisfies Record<string, EligibilityKey>;

const FEE_BASES = ["AMOUNT", "INCLUDED", "PROVIDER_TARIFF"] as const satisfies readonly FeeRow["basis"][];
const CHARGE_UNITS = [
  "PER_MONTH",
  "PER_KWH",
  "PER_M3",
  "PER_PERSON_PER_MONTH",
  "PER_VEHICLE_PER_MONTH",
  "ONE_OFF",
] as const satisfies readonly ChargeUnit[];

type NumberKey = "monthlyRent" | "depositMonths" | "depositAmount" | "minimumTermMonths" | "paymentPeriodMonths";

/**
 * "Edit the draft" (brokerage-agreement US-1 AC-3, AC-5, S3-D18): the dates, the public photo consent, the confirmed
 * terms and the brokerage fee (E05-S4, BR-7) of the draft, beside the survey reference whose values the Sale may copy.
 * The values live in this component's state only, never in storage or the URL (BR-17). The checks run here as the server
 * runs them and nothing is sent while one fails. "Save the draft" sends the whole draft once with the page's data
 * version: a click while it runs sends nothing. Every refusal is shown by its code and keeps the values typed.
 */
export function DraftEditForm({ agreementId, dataVersion, version, onSaved, onCancel, onReload }: DraftEditFormProps) {
  const t = useTranslations("BrokerageAgreement");
  const [form, setForm] = useState<DraftEditValues>(() => formFromVersion(version));
  const [fee, setFee] = useState<FeePolicyValues>(() => feePolicyValuesOf(version.feePolicy));

  /** Set when a save is pressed, cleared when its action ends: a click meanwhile is not even queued. */
  const sending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState(async (prev: EditState): Promise<EditState> => {
    const round = prev.round + 1;
    try {
      const problems = draftEditProblems(form);
      const feeErrors = checkFeePolicy(fee);
      if (Object.keys(problems).length > 0 || Object.keys(feeErrors).length > 0) {
        return { problems, feeErrors, outcome: null, round };
      }
      // The fee policy is one more part of the whole draft (brokerage-agreement S4-D1).
      const body = { ...draftEditBody(form, dataVersion), feePolicy: feePolicyBody(fee) };
      const outcome = await saveDraft(agreementId, body);
      if (outcome.kind === "saved") onSaved();
      return { problems: {}, feeErrors: {}, outcome, round };
    } catch {
      return { problems: {}, feeErrors: {}, outcome: { kind: "failed" }, round };
    } finally {
      sending.current = false;
    }
  }, INITIAL);

  const submit = () => {
    if (sending.current || state.outcome?.kind === "saved") return;
    sending.current = true;
    dispatch();
  };

  // After a refusal the message takes the focus; after client problems, the first field in error.
  useEffect(() => {
    if (state.round === 0) return;
    if (state.outcome !== null && state.outcome.kind !== "saved") messageRef.current?.focus();
    else if (Object.keys(state.problems).length > 0 || Object.keys(state.feeErrors).length > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [state]);

  const baseId = useId();
  const idOf = (name: string) => `${baseId}-${name}`;

  const { problems, outcome } = state;
  const rejected: readonly DraftEditField[] = outcome?.kind === "invalid" ? outcome.fields : [];
  const errorOf = (field: DraftEditField) => {
    const problem = problems[field];
    return problem === undefined ? undefined : t(problemKey(problem));
  };
  const invalid = (field: DraftEditField) => errorOf(field) !== undefined || rejected.includes(field);
  const note = (from: SurveyNote | null | undefined) =>
    from === null || from === undefined ? null : (
      <p className="text-xs font-medium text-violet-700">
        {t("edit.fromSurvey", { source: t(from.sourceKey), date: from.dateText })}
      </p>
    );
  const change =
    <K extends keyof DraftEditValues>(key: K, read: (value: string) => DraftEditValues[K]) =>
    (event: { target: { value: string } }) => {
      const value = read(event.target.value);
      setForm((current) => withValue(current, key, value));
    };
  const text = (value: string) => value;

  const numberField = (key: NumberKey, label: string, from?: SurveyNote) => {
    const id = idOf(key);
    const error = errorOf(key);
    return (
      <div className="space-y-1">
        <FormField id={id} label={label} error={error}>
          <Input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={form[key]}
            invalid={invalid(key)}
            aria-describedby={describedBy(id, error)}
            onChange={change(key, text)}
          />
        </FormField>
        {note(from)}
      </div>
    );
  };

  const feeRow = (row: FeeRow, index: number) => {
    const field = (name: "name" | "basis" | "amount" | "chargeUnit") => `fees.${index}.${name}` as const;
    const ids = {
      name: idOf(`fee-${index}-name`),
      basis: idOf(`fee-${index}-basis`),
      amount: idOf(`fee-${index}-amount`),
      unit: idOf(`fee-${index}-unit`),
    };
    const errors = { name: errorOf(field("name")), amount: errorOf(field("amount")), unit: errorOf(field("chargeUnit")) };
    const patch = (values: Partial<Omit<FeeRow, "fromSurvey">>) => setForm((current) => withFee(current, index, values));
    return (
      <li key={index} className="space-y-3 rounded-lg border border-slate-200 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField id={ids.name} label={t("edit.feeName")} error={errors.name}>
            <Input
              id={ids.name}
              type="text"
              autoComplete="off"
              value={row.name}
              invalid={invalid(field("name"))}
              aria-describedby={describedBy(ids.name, errors.name)}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </FormField>
          <FormField id={ids.basis} label={t("edit.feeBasis")}>
            <Select
              id={ids.basis}
              value={row.basis}
              invalid={invalid(field("basis"))}
              onChange={(event) => patch({ basis: event.target.value as FeeRow["basis"] })}
            >
              {FEE_BASES.map((basis) => (
                <option key={basis} value={basis}>
                  {t(`edit.feeBasisOption.${basis}`)}
                </option>
              ))}
            </Select>
          </FormField>
          {row.basis === "AMOUNT" && (
            <>
              <FormField id={ids.amount} label={t("edit.feeAmount")} error={errors.amount}>
                <Input
                  id={ids.amount}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={row.amount}
                  invalid={invalid(field("amount"))}
                  aria-describedby={describedBy(ids.amount, errors.amount)}
                  onChange={(event) => patch({ amount: event.target.value })}
                />
              </FormField>
              <FormField id={ids.unit} label={t("edit.feeUnit")} error={errors.unit}>
                <Select
                  id={ids.unit}
                  value={row.chargeUnit}
                  invalid={invalid(field("chargeUnit"))}
                  aria-describedby={describedBy(ids.unit, errors.unit)}
                  onChange={(event) => patch({ chargeUnit: event.target.value as FeeRow["chargeUnit"] })}
                >
                  <option value="">{t("edit.feeUnitNone")}</option>
                  {CHARGE_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {t(chargeUnitText(unit))}
                    </option>
                  ))}
                </Select>
              </FormField>
            </>
          )}
        </div>
        {note(row.fromSurvey)}
        <Button variant="ghost" className="px-3 py-1.5" onClick={() => setForm((current) => withFeeRemoved(current, index))}>
          {t("edit.removeFee")}
        </Button>
      </li>
    );
  };

  const support =
    outcome !== null && "correlationId" in outcome && outcome.correlationId !== undefined ? (
      <p className="mt-1 text-xs">{t("edit.supportCode", { code: outcome.correlationId })}</p>
    ) : null;
  let message: ReactNode = null;
  if (outcome?.kind === "refused" && outcome.reason === "notEligible") {
    message = (
      <Alert tone="error">
        <p>{t("edit.errors.notEligible")}</p>
        {outcome.groupKeys.map((key, index) => (
          <p key={`${index}:${key}`} className="mt-1">
            {t(key)}
          </p>
        ))}
      </Alert>
    );
  } else if (outcome?.kind === "refused") {
    message = (
      <Alert tone="error">
        <p>{t(REFUSAL_TEXT[outcome.reason])}</p>
        {outcome.reason === "stale" && (
          <Button variant="secondary" className="mt-2 px-4 py-2" onClick={onReload}>
            {t("edit.reload")}
          </Button>
        )}
      </Alert>
    );
  } else if (outcome?.kind === "invalid" || outcome?.kind === "failed") {
    message = (
      <Alert tone="error">
        <p>{t("edit.errors.failed")}</p>
        {support}
      </Alert>
    );
  }

  const ids = {
    start: idOf("startDate"),
    end: idOf("endDate"),
    interior: idOf("interior"),
    exterior: idOf("exterior"),
    deposit: idOf("deposit"),
    depositValue: idOf("depositValue"),
    fees: idOf("fees"),
  };
  const startError = errorOf("startDate");
  const endError = errorOf("endDate");
  const depositKey = form.depositBasis === "AMOUNT" ? "depositAmount" : "depositMonths";
  const depositError = errorOf(depositKey);
  const feesError = errorOf("fees");
  const rows = form.fees.kind === "list" ? form.fees.rows : [];
  const legend = "text-sm font-semibold text-slate-900";

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-slate-900">{t("edit.title")}</h4>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <form ref={formRef} action={submit} noValidate className="min-w-0 space-y-4">
          {message !== null && (
            <div ref={messageRef} tabIndex={-1} className="outline-none">
              {message}
            </div>
          )}
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">{t("edit.transactionType")}</dt>
              <dd className="text-slate-900">{t("transactionType.LONG_TERM_RENT")}</dd>
            </div>
            {version.advertisingScope !== undefined && (
              <div>
                <dt className="text-slate-500">{t("terms.advertising")}</dt>
                <dd className="text-slate-900">{t(advertisingScopeText(version.advertisingScope))}</dd>
              </div>
            )}
          </dl>
          <fieldset disabled={pending} className="min-w-0 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id={ids.start} label={t("draft.startDate")} error={startError}>
                <Input
                  id={ids.start}
                  type="date"
                  min={EARLIEST_DATE}
                  max={LATEST_DATE}
                  value={form.startDate}
                  invalid={invalid("startDate")}
                  aria-describedby={describedBy(ids.start, startError)}
                  onChange={change("startDate", text)}
                />
              </FormField>
              <FormField id={ids.end} label={t("draft.endDate")} error={endError} hint={t("draft.periodHint")}>
                <Input
                  id={ids.end}
                  type="date"
                  min={EARLIEST_DATE}
                  max={LATEST_DATE}
                  value={form.endDate}
                  invalid={invalid("endDate")}
                  aria-describedby={describedBy(ids.end, endError, true)}
                  onChange={change("endDate", text)}
                />
              </FormField>
            </div>
            <fieldset className="min-w-0 space-y-3">
              <legend className={legend}>{t("terms.photos")}</legend>
              <FormField id={ids.interior} label={t("edit.interior")}>
                <Select
                  id={ids.interior}
                  value={form.photoConsent}
                  onChange={change("photoConsent", (value) => value as DraftEditValues["photoConsent"])}
                >
                  <option value="yes">{t("edit.consent.yes")}</option>
                  <option value="no">{t("edit.consent.no")}</option>
                  <option value="unanswered">{t("edit.consent.unanswered")}</option>
                </Select>
              </FormField>
              <div className="flex items-start gap-2">
                <input
                  id={ids.exterior}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                  checked={form.exteriorPhotoConsent}
                  disabled={form.photoConsent !== "yes"}
                  aria-invalid={invalid("exteriorPhotoConsent") || undefined}
                  onChange={(event) => {
                    const { checked } = event.target;
                    setForm((current) => withValue(current, "exteriorPhotoConsent", checked));
                  }}
                />
                <label htmlFor={ids.exterior} className="text-sm text-slate-700">
                  {t("edit.exterior")}
                </label>
              </div>
            </fieldset>
            <fieldset className="min-w-0 space-y-4">
              <legend className={legend}>{t("terms.rental")}</legend>
              {numberField("monthlyRent", t("edit.monthlyRent"), form.fromSurvey.monthlyRent)}
              <div className="space-y-1">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField id={ids.deposit} label={t("edit.deposit")}>
                    <Select
                      id={ids.deposit}
                      value={form.depositBasis}
                      invalid={invalid("depositBasis")}
                      onChange={change("depositBasis", (value) => value as DraftEditValues["depositBasis"])}
                    >
                      <option value="">{t("edit.depositNone")}</option>
                      <option value="MONTHS">{t("edit.depositMonths")}</option>
                      <option value="AMOUNT">{t("edit.depositAmount")}</option>
                    </Select>
                  </FormField>
                  {form.depositBasis !== "" && (
                    <FormField id={ids.depositValue} label={t("edit.depositValue")} error={depositError}>
                      <Input
                        id={ids.depositValue}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={form[depositKey]}
                        invalid={invalid(depositKey)}
                        aria-describedby={describedBy(ids.depositValue, depositError)}
                        onChange={change(depositKey, text)}
                      />
                    </FormField>
                  )}
                </div>
                {note(form.fromSurvey.deposit)}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {numberField("minimumTermMonths", t("edit.minimumTerm"), form.fromSurvey.minimumTermMonths)}
                {numberField("paymentPeriodMonths", t("edit.paymentPeriod"), form.fromSurvey.paymentPeriodMonths)}
              </div>
              <div className="space-y-3">
                <FormField id={ids.fees} label={t("edit.fees")} error={feesError}>
                  <Select
                    id={ids.fees}
                    value={form.fees.kind}
                    invalid={invalid("fees")}
                    aria-describedby={describedBy(ids.fees, feesError)}
                    onChange={(event) => {
                      const { value } = event.target;
                      setForm((current) => {
                        if (value === "list") return current.fees.kind === "list" ? current : withFeeAdded(current);
                        return withValue(current, "fees", value === "none" ? { kind: "none" } : { kind: "notStated" });
                      });
                    }}
                  >
                    <option value="notStated">{t("edit.feesNotStated")}</option>
                    <option value="none">{t("edit.feesNone")}</option>
                    <option value="list">{t("edit.feesList")}</option>
                  </Select>
                </FormField>
                {form.fees.kind === "list" && (
                  <>
                    <ul className="space-y-3">{rows.map(feeRow)}</ul>
                    <Button
                      variant="secondary"
                      className="px-4 py-2"
                      disabled={rows.length >= MAX_FEES}
                      onClick={() => setForm((current) => withFeeAdded(current))}
                    >
                      {t("edit.addFee")}
                    </Button>
                  </>
                )}
              </div>
            </fieldset>
            <FeePolicySection
              values={fee}
              onChange={setFee}
              errors={state.feeErrors}
              rejected={rejected.includes("feePolicy")}
            />
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <SubmitButton fullWidth={false} disabled={pending}>
              {t("edit.save")}
            </SubmitButton>
            <Button variant="secondary" disabled={pending} onClick={onCancel}>
              {t("edit.cancel")}
            </Button>
          </div>
        </form>
        <SurveyTermsPanel
          agreementId={agreementId}
          onUse={(proposal) => setForm((current) => formWithProposal(current, proposal))}
        />
      </div>
    </div>
  );
}
