"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

import type { EligibilityKey } from "../lib/reason-text";
import { channelChoiceText, introducedChoiceText, INTRODUCED_VALUES, terminationTypeText, WITHDRAWAL_CHANNELS } from "../lib/stop-text";
import type { StopOutcome } from "../lib/suspension-flow";
import { STOP_TEXT_MAX } from "../lib/suspension-form";
import { terminate } from "../lib/termination-flow";
import {
  EARLIEST_REPORTED_ON,
  EMPTY_TERMINATION_VALUES,
  terminationBody,
  terminationErrors,
  type TerminationField,
  terminationServerErrors,
  type TerminationValues,
  vietnamToday,
} from "../lib/termination-form";
import type { TerminationType } from "../types";

import { StopOutcomeNotice } from "./stop-outcome-notice";

type TerminationDialogProps = {
  agreementId: string;
  /** The termination types the viewer may record now, in their order (a hint from the server, which decides). */
  types: TerminationType[];
  /** "Keep it", Esc or the backdrop, while no request runs: the section closes the dialog. */
  onClose: () => void;
  /** A 204: the section closes the dialog and the page reads the agreement again. */
  onDone: () => void;
  /** A 403 or another 409: the section closes the dialog, the page reads again and shows the code's sentence. */
  onChanged: (code: string) => void;
  /** "Reload" after a change made at the same time: the page reads the agreement again. */
  onReload: () => void;
};

type TerminateState = { errors: Partial<Record<TerminationField, EligibilityKey>>; outcome: StopOutcome | null; round: number };

const INITIAL: TerminateState = { errors: {}, outcome: null, round: 0 };

/**
 * "End the agreement" (brokerage-agreement US-5 AC-2, BR-14, S8-D5): the types the viewer may record, none chosen, then
 * the chosen type's fields: the date the owner said it or it was reported (today in Vietnam at first and at most,
 * E05S8-P10) with how the owner said it, or whether Sunvibe introduced the tenant, and an optional note; or, for
 * Sunvibe's decision, its required reason. Every value is private (BR-17). The browser checks the chosen type's fields
 * before any request (E05S8-P5); one request per click with exactly that type's fields and no data version (S8-D8).
 */
export function TerminationDialog({ agreementId, types, onClose, onDone, onChanged, onReload }: TerminationDialogProps) {
  const t = useTranslations("BrokerageAgreement");
  const baseId = useId();
  const idOf = (name: string) => `${baseId}-${name}`;
  // Today in Vietnam, read once when the dialog opens: the date's first value and its latest (input help only).
  const [today] = useState(() => vietnamToday(new Date()));
  const [values, setValues] = useState<TerminationValues>(() => ({ ...EMPTY_TERMINATION_VALUES, reportedOn: today }));

  /** Set when "End the agreement" is pressed, cleared when its action ends: a click meanwhile is not even queued. */
  const sending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState(async (prev: TerminateState): Promise<TerminateState> => {
    const round = prev.round + 1;
    try {
      const errors = terminationErrors(values, today);
      const { type } = values;
      if (type === "" || Object.keys(errors).length > 0) return { errors, outcome: null, round };
      const outcome = await terminate(agreementId, terminationBody({ ...values, type }));
      if (outcome.kind === "done") onDone();
      if (outcome.kind === "changed") onChanged(outcome.code);
      return { errors: {}, outcome, round };
    } catch {
      return { errors: {}, outcome: { kind: "failed" }, round };
    } finally {
      sending.current = false;
    }
  }, INITIAL);

  const { errors, outcome } = state;
  const handedBack = outcome?.kind === "done" || outcome?.kind === "changed";
  const busy = pending || handedBack;
  const server = outcome?.kind === "fields" ? terminationServerErrors(outcome.fields) : { errors: {}, other: false };

  const submit = () => {
    if (sending.current || handedBack) return;
    sending.current = true;
    dispatch();
  };

  // After an answer its message takes the focus; else the first field in error (a radio of the type carries
  // `data-invalid`, since a radio takes no `aria-invalid`).
  useEffect(() => {
    if (state.round === 0) return;
    if (messageRef.current !== null) messageRef.current.focus();
    else formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')?.focus();
  }, [state]);

  const close = () => {
    if (!busy) onClose();
  };
  const errorOf = (field: TerminationField): string | undefined => {
    const key = errors[field] ?? server.errors[field];
    return key === undefined ? undefined : t(key);
  };
  const set = (patch: Partial<TerminationValues>) => setValues((current) => ({ ...current, ...patch }));

  const typeError = errorOf("type");
  const reportedOnError = errorOf("reportedOn");
  const channelError = errorOf("channel");
  const introducedError = errorOf("introducedBySunvibe");
  const noteError = errorOf("note");
  const { type } = values;
  const legendId = idOf("type");
  const typeErrorId = idOf("type-error");

  return (
    <Dialog open onClose={close} title={t("stop.terminateDialog.title")}>
      <form ref={formRef} action={submit} noValidate className="space-y-4">
        <StopOutcomeNotice ref={messageRef} outcome={outcome} otherFields={server.other} onReload={onReload} />
        <fieldset aria-labelledby={legendId} className="space-y-2">
          <legend id={legendId} className="text-sm font-medium text-slate-700">
            {t("stop.terminateDialog.type")}
          </legend>
          {types.map((code) => (
            <label key={code} className="flex items-start gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name={idOf("type-choice")}
                value={code}
                checked={type === code}
                disabled={busy}
                data-invalid={typeError !== undefined || undefined}
                aria-describedby={typeError === undefined ? undefined : typeErrorId}
                onChange={() => set({ type: code })}
                className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
              />
              <span>{t(terminationTypeText(code))}</span>
            </label>
          ))}
          {typeError !== undefined && (
            <p id={typeErrorId} className="text-sm text-rose-600">
              {typeError}
            </p>
          )}
        </fieldset>
        {(type === "OWNER_WITHDREW" || type === "UNIT_LET") && (
          <FormField id={idOf("reportedOn")} label={t("stop.terminateDialog.reportedOn")} error={reportedOnError}>
            <Input
              id={idOf("reportedOn")}
              name="reportedOn"
              type="date"
              min={EARLIEST_REPORTED_ON}
              max={today}
              value={values.reportedOn}
              disabled={busy}
              invalid={reportedOnError !== undefined}
              aria-describedby={describedBy(idOf("reportedOn"), reportedOnError)}
              onChange={(event) => set({ reportedOn: event.target.value })}
            />
          </FormField>
        )}
        {type === "OWNER_WITHDREW" && (
          <FormField id={idOf("channel")} label={t("stop.terminateDialog.channel")} error={channelError}>
            <Select
              id={idOf("channel")}
              name="channel"
              value={values.channel}
              disabled={busy}
              invalid={channelError !== undefined}
              aria-describedby={describedBy(idOf("channel"), channelError)}
              onChange={(event) => set({ channel: WITHDRAWAL_CHANNELS.find((code) => code === event.target.value) ?? "" })}
            >
              <option value="">{t("stop.terminateDialog.chooseChannel")}</option>
              {WITHDRAWAL_CHANNELS.map((code) => (
                <option key={code} value={code}>
                  {t(channelChoiceText(code))}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {type === "UNIT_LET" && (
          <FormField id={idOf("introduced")} label={t("stop.terminateDialog.introducedLabel")} error={introducedError}>
            <Select
              id={idOf("introduced")}
              name="introducedBySunvibe"
              value={values.introducedBySunvibe}
              disabled={busy}
              invalid={introducedError !== undefined}
              aria-describedby={describedBy(idOf("introduced"), introducedError)}
              onChange={(event) => set({ introducedBySunvibe: INTRODUCED_VALUES.find((code) => code === event.target.value) ?? "" })}
            >
              <option value="">{t("stop.terminateDialog.chooseIntroduced")}</option>
              {INTRODUCED_VALUES.map((code) => (
                <option key={code} value={code}>
                  {t(introducedChoiceText(code))}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {type !== "" && (
          <FormField
            id={idOf("note")}
            label={t(type === "SUNVIBE_TERMINATED" ? "stop.terminateDialog.sunvibeNote" : "stop.terminateDialog.note")}
            optional={type !== "SUNVIBE_TERMINATED"}
            error={noteError}
          >
            <Textarea
              id={idOf("note")}
              name="note"
              rows={3}
              maxLength={STOP_TEXT_MAX}
              value={values.note}
              disabled={busy}
              invalid={noteError !== undefined}
              aria-describedby={describedBy(idOf("note"), noteError)}
              onChange={(event) => set({ note: event.target.value })}
            />
          </FormField>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={close}>
            {t("stop.terminateDialog.keep")}
          </Button>
          <SubmitButton fullWidth={false} disabled={busy}>
            {t("stop.terminateDialog.submit")}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
