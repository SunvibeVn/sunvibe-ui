"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

import {
  draftBody,
  type DraftField,
  type DraftForm,
  draftProblems,
  type DraftProblems,
  EARLIEST_DATE,
  LATEST_DATE,
} from "../lib/agreement-draft-form";
import { type DraftOutcome, submitDraft } from "../lib/agreement-draft-flow";
import { agreementPath } from "../lib/agreement-model";
import type { EligibilityKey } from "../lib/reason-text";

type DraftDialogProps = {
  leadId: string;
  unitId: string;
  /** Null when the unit row is missing: the dialog says "A unit with no code". */
  unitCode: string | null;
  /** Cancel, Esc, the backdrop or the close button: the section always closes the dialog. */
  onClose: () => void;
  /** A refusal: the section reads the eligibility again and keeps its list meanwhile (spec section 6). */
  onRefused: () => void;
};

/** What the last submit left on screen: the client checks' problems, or the answer of the server. */
type DraftState = { problems: DraftProblems; outcome: DraftOutcome | null };

const INITIAL: DraftState = { problems: {}, outcome: null };
const EMPTY_FORM: DraftForm = { startDate: "", endDate: "" };

const REFUSAL_TEXT = {
  exists: "draft.errors.exists",
  notAssignee: "draft.errors.notAssignee",
  notFound: "draft.errors.notFound",
  conflict: "draft.errors.conflict",
} as const satisfies Record<string, EligibilityKey>;

/**
 * "Draft an agreement" for one unit of the lead's basis (brokerage-agreement US-1, S2-D14): the unit, long-term rental,
 * the start and end dates. The period is checked here as the server checks it (BR-6) and nothing is sent while it
 * fails. "Create the draft" sends one request: it is disabled while the request runs, and a click meanwhile sends
 * nothing. A created draft moves to its page; every other answer keeps the dialog open with the dates typed.
 */
export function AgreementDraftDialog({ leadId, unitId, unitCode, onClose, onRefused }: DraftDialogProps) {
  const t = useTranslations("BrokerageAgreement");
  const router = useRouter();
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);

  /** Set when a submit is pressed, cleared when its action ends: a click meanwhile is not even queued. */
  const sending = useRef(false);

  const [state, dispatch, pending] = useActionState(async (prev: DraftState): Promise<DraftState> => {
    try {
      const problems = draftProblems(form);
      if (Object.keys(problems).length > 0) return { problems, outcome: null };
      const outcome = await submitDraft(draftBody(form, leadId, unitId));
      if (outcome.kind === "created") router.push(agreementPath(outcome.agreementId));
      else if (outcome.kind === "refused") onRefused();
      return { problems: {}, outcome };
    } catch {
      return { ...prev, outcome: { kind: "failed" } };
    } finally {
      sending.current = false;
    }
  }, INITIAL);

  const submit = () => {
    if (sending.current || state.outcome?.kind === "created") return;
    sending.current = true;
    dispatch();
  };

  const formId = useId();
  const startId = useId();
  const endId = useId();

  const { problems, outcome } = state;
  const rejected: readonly DraftField[] = outcome?.kind === "invalid" ? outcome.fields : [];
  const fieldError = (field: DraftField) => {
    const problem = problems[field];
    return problem === undefined ? undefined : t(`draft.errors.${problem}`);
  };
  const startError = fieldError("startDate");
  const endError = fieldError("endDate");
  const edit = (field: DraftField) => (event: { target: { value: string } }) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const support =
    outcome !== null && "correlationId" in outcome && outcome.correlationId !== undefined ? (
      <p className="mt-1 text-xs">{t("eligibility.supportCode", { correlationId: outcome.correlationId })}</p>
    ) : null;

  let message = null;
  if (outcome?.kind === "refused") {
    message =
      outcome.reason === "notEligible" ? (
        <Alert tone="error">
          <p>{t("draft.errors.notEligible")}</p>
          {outcome.groupKeys.map((key, index) => (
            <p key={`${index}:${key}`} className="mt-1">
              {t(key)}
            </p>
          ))}
        </Alert>
      ) : (
        <Alert tone="error">
          <p>{t(REFUSAL_TEXT[outcome.reason])}</p>
        </Alert>
      );
  } else if (outcome?.kind === "invalid" || outcome?.kind === "failed") {
    message = (
      <Alert tone="error">
        <p>{t("draft.errors.failed")}</p>
        {support}
      </Alert>
    );
  }

  const busy = pending || outcome?.kind === "created";

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("draft.title")}
      closeLabel={busy ? undefined : t("draft.cancel")}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t("draft.cancel")}
          </Button>
          <Button type="submit" form={formId} pending={pending} disabled={busy}>
            {t("draft.submit")}
          </Button>
        </>
      }
    >
      <form id={formId} action={submit} noValidate className="space-y-4">
        {message}
        <div className="space-y-1 text-sm text-slate-800">
          <p className="break-words font-semibold">{t("draft.unit", { code: unitCode ?? t("eligibility.noCode") })}</p>
          <p>{t("draft.transactionType", { type: t("transactionType.LONG_TERM_RENT") })}</p>
        </div>
        <fieldset disabled={busy} className="space-y-4">
          <FormField id={startId} label={t("draft.startDate")} error={startError}>
            <Input
              id={startId}
              type="date"
              min={EARLIEST_DATE}
              max={LATEST_DATE}
              value={form.startDate}
              invalid={startError !== undefined || rejected.includes("startDate")}
              aria-describedby={describedBy(startId, startError)}
              onChange={edit("startDate")}
            />
          </FormField>
          <FormField id={endId} label={t("draft.endDate")} error={endError} hint={t("draft.periodHint")}>
            <Input
              id={endId}
              type="date"
              min={EARLIEST_DATE}
              max={LATEST_DATE}
              value={form.endDate}
              invalid={endError !== undefined || rejected.includes("endDate")}
              aria-describedby={describedBy(endId, endError, true)}
              onChange={edit("endDate")}
            />
          </FormField>
        </fieldset>
      </form>
    </Dialog>
  );
}
