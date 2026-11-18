"use client";

import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useActionState, useEffect, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

import { type ActivationOutcome, activateVersion } from "../lib/activation-flow";
import {
  type ActivationField,
  type ActivationValues,
  activationBody,
  activationErrors,
  EMPTY_ACTIVATION_VALUES,
} from "../lib/activation-form";
import type { ActivationModel } from "../lib/activation-model";
import type { EligibilityKey } from "../lib/reason-text";

import { ActivationRefusalDialog } from "./activation-refusal-dialog";

type ActivationFormProps = {
  agreementId: string;
  /** The data version the page read, sent back as `expectedDataVersion` (brokerage-agreement BR-5, S6-D1). */
  dataVersion: number;
  /** The version awaiting activation, its deadline and the statement the manager makes. */
  model: Extract<ActivationModel, { kind: "decide" }>;
  /** A 204 of the activation or of the refusal: the page reads the agreement again. */
  onDecided: () => void;
  /** The version no longer awaits activation or the statement changed: the page says so and reads again. */
  onChanged: () => void;
  /** "Reload" after a change made meanwhile: the page reads the agreement again. */
  onReload: () => void;
};

/** What the last activation left on screen: the browser's checks, or the server's answer. */
type ActivateState = {
  errors: Partial<Record<ActivationField, EligibilityKey>>;
  outcome: ActivationOutcome | null;
  round: number;
};

const INITIAL: ActivateState = { errors: {}, outcome: null, round: 0 };

/** An instant on the staff page, as the version list formats its times (the page's provider sets the zone). */
const TIME_FORMAT = { dateStyle: "medium", timeStyle: "short" } as const;

const REFUSAL_TEXT = {
  notIndependent: "activation.errors.notIndependent",
  periodEnded: "activation.errors.periodEnded",
  notFound: "activation.errors.notFound",
  concurrent: "activation.errors.concurrent",
} as const satisfies Record<string, EligibilityKey>;

const TEXT_FIELDS = [
  { field: "documentNumber", label: "activation.documentNumber" },
  { field: "sunvibeSignatoryName", label: "activation.signatoryName" },
  { field: "sunvibeSignatoryTitle", label: "activation.signatoryTitle" },
] as const satisfies readonly { field: ActivationField; label: EligibilityKey }[];

/**
 * "Activation" on the staff page (brokerage-agreement US-3 AC-1, AC-2, BR-6, BR-7, S6-D1, S6-D3, S6-D22): when the owner
 * confirmed the version and until when it may be activated; for a free fee, the line to check against the signed
 * document; the signed document's four values; the server's statement and its box. "Activate" stays disabled until the
 * box is ticked and sends one request per click with the statement version and the data version the page read;
 * "Refuse activation" opens the refusal dialog. The browser checks only that each value is there and within its bound;
 * every refusal is shown by its code. The typed values are private (BR-17): they live in this form and its one request.
 */
export function ActivationForm({ agreementId, dataVersion, model, onDecided, onChanged, onReload }: ActivationFormProps) {
  const t = useTranslations("BrokerageAgreement");
  const format = useFormatter();
  const [values, setValues] = useState<ActivationValues>(EMPTY_ACTIVATION_VALUES);
  const [refusing, setRefusing] = useState(false);
  const titleId = useId();
  const baseId = useId();
  const idOf = (name: string) => `${baseId}-${name}`;

  /** Set when "Activate" is pressed, cleared when its action ends: a click meanwhile is not even queued. */
  const sending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState(async (prev: ActivateState): Promise<ActivateState> => {
    const round = prev.round + 1;
    try {
      const errors = activationErrors(values);
      if (Object.keys(errors).length > 0) return { errors, outcome: null, round };
      const body = activationBody(values, {
        versionNo: model.versionNo,
        statementVersion: model.statementVersion,
        dataVersion,
      });
      if (body === null) return { errors: {}, outcome: null, round };
      const outcome = await activateVersion(agreementId, body);
      if (outcome.kind === "activated") onDecided();
      if (outcome.kind === "refused" && outcome.reason === "reload") onChanged();
      return { errors: {}, outcome, round };
    } catch {
      return { errors: {}, outcome: { kind: "failed" }, round };
    } finally {
      sending.current = false;
    }
  }, INITIAL);

  const { errors, outcome } = state;
  const done = outcome?.kind === "activated";

  const submit = () => {
    if (sending.current || done || !values.statementTicked) return;
    sending.current = true;
    dispatch();
  };

  // After a refusal the message takes the focus; after a field's refusal, the first field in error.
  useEffect(() => {
    const { outcome: last } = state;
    if (state.round === 0) return;
    if (last !== null && last.kind !== "activated" && !(last.kind === "refused" && (last.reason === "reload" || last.reason === "fields"))) {
      messageRef.current?.focus();
    } else if (Object.keys(state.errors).length > 0 || (last?.kind === "refused" && last.reason === "fields")) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [state]);

  const errorOf = (field: ActivationField): string | undefined => {
    const key = errors[field] ?? (outcome?.kind === "refused" && outcome.reason === "fields" ? outcome.fields[field] : undefined);
    return key === undefined ? undefined : t(key);
  };
  const change = (field: Exclude<keyof ActivationValues, "statementTicked">) => (event: { target: { value: string } }) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
  };

  let message: ReactNode = null;
  if (outcome?.kind === "refused" && outcome.reason === "notEligible") {
    message = (
      <Alert tone="error">
        <p>{t("activation.errors.notEligible")}</p>
        {outcome.groupKeys.map((key, index) => (
          <p key={`${index}:${key}`} className="mt-1">
            {t(key)}
          </p>
        ))}
      </Alert>
    );
  } else if (outcome?.kind === "refused" && outcome.reason !== "reload" && outcome.reason !== "fields") {
    message = (
      <Alert tone="error">
        <p>{t(REFUSAL_TEXT[outcome.reason])}</p>
        {outcome.reason === "concurrent" && (
          <Button variant="secondary" className="mt-2 px-4 py-2" onClick={onReload}>
            {t("activation.reload")}
          </Button>
        )}
      </Alert>
    );
  } else if (outcome?.kind === "failed") {
    message = (
      <Alert tone="error">
        <p>{t("activation.errors.failed")}</p>
        {outcome.correlationId !== undefined && (
          <p className="mt-1 text-xs">{t("activation.supportCode", { code: outcome.correlationId })}</p>
        )}
      </Alert>
    );
  }

  const signedOnError = errorOf("signedOn");
  const statementId = idOf("statement");

  return (
    <section aria-labelledby={titleId} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id={titleId} className="text-base font-semibold text-slate-900">
        {t("activation.title")}
      </h2>
      <p className="text-sm text-slate-700">
        {t("activation.confirmed", {
          number: model.versionNo,
          time: format.dateTime(new Date(model.confirmedAt), TIME_FORMAT),
          deadline: format.dateTime(new Date(model.activateBy), TIME_FORMAT),
        })}
      </p>
      {model.freeFee !== null && (
        <p className="break-words rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          {model.freeFee.reason === null
            ? t("activation.freeFeeNoReason", { number: model.versionNo })
            : t("activation.freeFee", { number: model.versionNo, reason: model.freeFee.reason })}
        </p>
      )}
      <form ref={formRef} action={submit} noValidate className="space-y-3">
        {message !== null && (
          <div ref={messageRef} tabIndex={-1} className="outline-none">
            {message}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TEXT_FIELDS.map(({ field, label }) => {
            const id = idOf(field);
            const error = errorOf(field);
            return (
              <FormField key={field} id={id} label={t(label)} error={error}>
                <Input
                  id={id}
                  name={field}
                  type="text"
                  autoComplete="off"
                  value={values[field]}
                  invalid={error !== undefined}
                  aria-describedby={describedBy(id, error)}
                  onChange={change(field)}
                />
              </FormField>
            );
          })}
          <FormField id={idOf("signedOn")} label={t("activation.signedOn")} error={signedOnError}>
            <Input
              id={idOf("signedOn")}
              name="signedOn"
              type="date"
              value={values.signedOn}
              invalid={signedOnError !== undefined}
              aria-describedby={describedBy(idOf("signedOn"), signedOnError)}
              onChange={change("signedOn")}
            />
          </FormField>
        </div>
        <p className="whitespace-pre-line break-words rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
          {model.statementText}
        </p>
        <div className="flex items-start gap-2">
          <input
            id={statementId}
            type="checkbox"
            checked={values.statementTicked}
            disabled={done}
            onChange={(event) => {
              const { checked } = event.target;
              setValues((current) => ({ ...current, statementTicked: checked }));
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
          />
          <label htmlFor={statementId} className="text-sm font-medium text-slate-800">
            {t("activation.statementBox")}
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <SubmitButton fullWidth={false} disabled={done || !values.statementTicked}>
            {t("activation.activate")}
          </SubmitButton>
          <Button variant="secondary" disabled={done || pending} onClick={() => setRefusing(true)}>
            {t("activation.refuse")}
          </Button>
        </div>
      </form>
      {refusing && (
        <ActivationRefusalDialog
          agreementId={agreementId}
          versionNo={model.versionNo}
          dataVersion={dataVersion}
          onClose={() => setRefusing(false)}
          onRefused={onDecided}
          onChanged={onChanged}
          onReload={onReload}
        />
      )}
    </section>
  );
}
