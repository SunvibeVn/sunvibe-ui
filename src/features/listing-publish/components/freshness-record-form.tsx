"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useEffect, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

import { type FormState, initialFormState, messageState } from "../lib/form-state";
import {
  type Channel,
  EMPTY_FRESHNESS_FORM,
  type FreshnessFormValues,
  hintKeys,
  isComplete,
  noteCount,
  type Outcome,
} from "../lib/freshness-record-form";
import { formStateOf, type ListingChange, listingChangeOf, runFreshnessRecord } from "../lib/freshness-record-flow";
import { channelKey, outcomeKey } from "../lib/freshness-text";
import type { ListingKey } from "../lib/revision-text";
import { freshnessRecordSchema } from "../schemas/freshness-record.schema";
import { recordListingFreshness } from "../services/freshness-api";

import { useFieldErrors } from "./use-field-errors";

type FreshnessRecordFormProps = {
  listingId: string;
  /** The listing's data version the page read last; the record sends it back (listing BR-3). */
  dataVersion: number;
  agreementHref: string;
  /** The page's listing re-read has not answered: the data version may be old, so "Save contact" waits. */
  listingRereading: boolean;
  /** A 201: the panel closes the form and reads its freshness again. */
  onDone: () => void;
  /** "Cancel": the panel closes the form; nothing is sent. */
  onCancel: () => void;
  /** The re-read of the listing the answer asks the page for (E06S3-D12, P8). */
  onListingChanged: (change: ListingChange) => void;
};

const CHANNELS: readonly Channel[] = ["CALL", "MESSAGE", "IN_PERSON"];
const OUTCOMES: readonly Outcome[] = ["AVAILABLE", "NOT_AVAILABLE", "UNREACHABLE"];

/** A problem code of the schema to its sentence; a code this form does not know reads the form-level sentence. */
const ERROR_KEYS: Readonly<Record<string, ListingKey>> = {
  channel: "freshness.form.errors.channel",
  outcome: "freshness.form.errors.outcome",
  answer: "freshness.form.errors.answer",
  noteTooLong: "freshness.form.errors.noteTooLong",
  noteCharacters: "freshness.form.errors.noteCharacters",
};

function errorKey(code: string): ListingKey {
  return Object.hasOwn(ERROR_KEYS, code) ? (ERROR_KEYS[code] as ListingKey) : "freshness.answers.invalid";
}

const CHOICE_CLASS = "mt-0.5 h-4 w-4 shrink-0 accent-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";
const LINK_CLASS =
  "font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

type Choice<T> = { value: T; label: string };

/**
 * "Record a contact" with the person letting the unit (listing-publish US-6 AC-1, AC-6, spec section 6, E06S3-D11,
 * E06S3-P13): the channel, the result with what a record of it does, the two questions of BR-9 for "Still available",
 * and the private note with its counter. A native form whose action checks the values with the request's schema and
 * sends one request with the listing's data version, never a date; each answer shows its one sentence. "Save contact"
 * waits until the form is complete and while the page reads the listing again. The server decides the record.
 */
export function FreshnessRecordForm({
  listingId,
  dataVersion,
  agreementHref,
  listingRereading,
  onDone,
  onCancel,
  onListingChanged,
}: FreshnessRecordFormProps) {
  const t = useTranslations("ListingPublish");
  const baseId = useId();
  const idOf = (name: string) => `${baseId}-${name}`;
  const [values, setValues] = useState<FreshnessFormValues>(EMPTY_FRESHNESS_FORM);
  /** Set when "Save contact" is pressed, cleared when its action ends: a submit meanwhile is not even queued. */
  const sending = useRef(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState(async (): Promise<FormState> => {
    try {
      const outcome = await runFreshnessRecord(listingId, values, dataVersion, { record: recordListingFreshness });
      if (outcome.kind === "done") onDone();
      const change = listingChangeOf(outcome);
      if (change !== null) onListingChanged(change);
      return formStateOf(outcome);
    } catch {
      return messageState("freshness.answers.failed");
    } finally {
      sending.current = false;
    }
  }, initialFormState);

  const fields = useFieldErrors(freshnessRecordSchema, values, state.fieldErrors);

  // An answer's sentence takes the focus, so a screen reader hears it.
  useEffect(() => {
    if (state.messageKey !== undefined) messageRef.current?.focus();
  }, [state]);

  const submit = () => {
    if (sending.current) return;
    sending.current = true;
    dispatch();
  };
  const set = (field: keyof FreshnessFormValues, patch: Partial<FreshnessFormValues>) => {
    fields.changed(field);
    setValues((current) => ({ ...current, ...patch }));
  };
  const errorText = (field: string): string | undefined => {
    const code = fields.errorFor(field);
    return code === undefined ? undefined : t(errorKey(code));
  };

  const hints = hintKeys(values);
  const prompt = (
    <p className="text-sm text-slate-700">
      {t("freshness.prompt")}{" "}
      <Link href={agreementHref} prefetch={false} className={LINK_CLASS}>
        {t("freshness.goToAgreement")}
      </Link>
    </p>
  );

  /** One group of choices named by its legend, its error under it; `children` follow the choices. */
  const choiceGroup = <T,>(field: keyof FreshnessFormValues, legend: string, choices: Choice<T>[], children?: ReactNode) => {
    const error = errorText(field);
    const errorId = idOf(`${field}-error`);
    return (
      <fieldset className="min-w-0 space-y-1.5">
        <legend className="text-sm font-medium text-slate-700">{legend}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {choices.map((choice) => (
            <label key={String(choice.value)} className="flex items-start gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name={idOf(field)}
                checked={values[field] === choice.value}
                disabled={pending}
                data-invalid={error !== undefined || undefined}
                aria-describedby={error === undefined ? undefined : errorId}
                onChange={() => set(field, { [field]: choice.value })}
                className={CHOICE_CLASS}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
        {error !== undefined && (
          <p id={errorId} className="text-sm text-rose-600">
            {error}
          </p>
        )}
        {children}
      </fieldset>
    );
  };

  const noteId = idOf("note");
  const noteError = errorText("note");

  return (
    <form
      action={submit}
      // Every field is controlled: the reset React makes after a form action would clear the choices on screen while
      // the state keeps them, so a refused record would look emptied. The values stay as chosen (spec section 6).
      onReset={(event) => event.preventDefault()}
      noValidate
      className="min-w-0 space-y-4 rounded-lg border border-slate-200 p-3 sm:p-4"
    >
      {state.messageKey !== undefined && (
        <div ref={messageRef} tabIndex={-1} className="focus:outline-none">
          <Alert tone="error">
            <p>{t(state.messageKey)}</p>
          </Alert>
        </div>
      )}
      {choiceGroup(
        "channel",
        t("freshness.form.channel"),
        CHANNELS.map((code) => ({ value: code, label: t(channelKey(code)) })),
      )}
      {choiceGroup(
        "outcome",
        t("freshness.form.outcome"),
        OUTCOMES.map((code) => ({ value: code, label: t(outcomeKey(code)) })),
        hints.length > 0 && (
          <div className="space-y-1">
            {hints
              .filter((key) => key !== "freshness.prompt")
              .map((key) => (
                <p key={key} className="text-sm text-slate-600">
                  {t(key)}
                </p>
              ))}
            {hints.includes("freshness.prompt") && prompt}
          </div>
        ),
      )}
      {values.outcome === "AVAILABLE" && (
        <>
          {choiceGroup("termsStillApply", t("freshness.form.termsQuestion"), [
            { value: true, label: t("freshness.form.termsYes") },
            { value: false, label: t("freshness.form.termsNo") },
          ])}
          {choiceGroup("unitUnchanged", t("freshness.form.unitQuestion"), [
            { value: true, label: t("freshness.form.unitUnchangedYes") },
            { value: false, label: t("freshness.form.unitChanged") },
          ])}
        </>
      )}
      <FormField id={noteId} label={t("freshness.form.note")} error={noteError} hint={t("freshness.form.noteCount", { count: noteCount(values.note) })}>
        <Textarea
          id={noteId}
          rows={3}
          value={values.note}
          disabled={pending}
          invalid={noteError !== undefined}
          aria-describedby={describedBy(noteId, noteError, true)}
          onChange={(event) => set("note", { note: event.target.value })}
          onBlur={() => fields.onBlur("note")}
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <SubmitButton fullWidth={false} disabled={pending || listingRereading || !isComplete(values)}>
          {t("freshness.form.save")}
        </SubmitButton>
        <Button variant="secondary" className="px-4 py-2" disabled={pending} onClick={onCancel}>
          {t("freshness.form.cancel")}
        </Button>
      </div>
    </form>
  );
}
