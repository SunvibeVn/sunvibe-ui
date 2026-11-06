"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { ArrowLeftIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RequireRole } from "@/features/auth/client";
import { formatDateTime } from "@/lib/format/vietnam-time";

import {
  type CaseDecisionForm,
  decisionBody,
  type DecisionProblems,
  decisionProblems,
  isDecidable,
  NEW_DECISION,
  proceedingChoices,
} from "../lib/case-decision-form";
import { commandOutcome, type IntakeMessage as Message, runCommand } from "../lib/intake-command";
import { CASES_PATH } from "../lib/intake-routes";
import { REASON_MAX } from "../lib/intake-text";
import { MANAGER_ROLES } from "../lib/intake-viewer";
import { viewAfterFailedRead } from "../lib/read-view";
import {
  ASSET_TYPE_LABEL,
  CASE_OUTCOME_LABEL,
  CASE_SIGNAL_LABEL,
  CASE_STATUS_LABEL,
  labelOf,
  RENTAL_SCOPE_LABEL,
} from "../lib/labels";
import { decideCase, getCase } from "../services/cases-api";
import { toIntakeUiError } from "../services/intake-api";
import type { CaseOutcome, InventoryCase } from "../types";

import { IntakeMessage } from "./intake-message";
import { Fact, StepCard } from "./step-card";

const OUTCOMES = Object.keys(CASE_OUTCOME_LABEL) as CaseOutcome[];

type DetailView = { kind: "ready"; item: InventoryCase } | { kind: "error"; correlationId?: string } | { kind: "gone" };

type DecisionState = { message: Message | null; problems: DecisionProblems };

const INITIAL: DecisionState = { message: null, problems: {} };

const backClass =
  "inline-flex min-h-8 items-center gap-1.5 rounded-full bg-violet-600/90 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/** `/workspace/inventory-cases/[caseId]`: one case and its decision (spec 4.10). */
export function CaseDetailView({ caseId }: { caseId: string }) {
  return (
    <RequireRole anyOf={MANAGER_ROLES}>
      <CaseDetail caseId={caseId} />
    </RequireRole>
  );
}

function CaseDetail({ caseId }: { caseId: string }) {
  const t = useTranslations("InventoryIntake");
  const [view, setView] = useState<DetailView | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<Message | null>(null);
  /** False while the route is hidden: a late answer is dropped, so no case lands in it. */
  const live = useRef(false);
  /** Number of the newest read; an older answer is dropped. */
  const newest = useRef(0);

  const load = useCallback((): Promise<void> => {
    const mine = ++newest.current;
    return getCase(caseId).then((result) => {
      if (!live.current || mine !== newest.current) return;
      if (result.ok) {
        setView({ kind: "ready", item: result.data });
        return;
      }
      const error = toIntakeUiError(result);
      if (error?.kind === "signed-out" || error?.kind === "unavailable") return;
      if (error?.kind === "not-found" || error?.kind === "forbidden" || error?.kind === "case-not-allowed") {
        setView({ kind: "gone" });
        return;
      }
      const failed: DetailView = error?.correlationId === undefined ? { kind: "error" } : { kind: "error", correlationId: error.correlationId };
      setView((previous) => viewAfterFailedRead(previous, failed));
    });
  }, [caseId]);

  // Next keeps this route hidden (Activity): nothing of the case stays in it.
  useLayoutEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      setView(null);
      setNotice(null);
    };
  }, []);

  useEffect(() => {
    void load();
  }, [load, attempt]);

  const decided = useCallback((item: InventoryCase) => {
    if (!live.current) return;
    newest.current += 1;
    setView({ kind: "ready", item });
  }, []);

  const back = (
    <Link href={CASES_PATH} prefetch={false} className={backClass}>
      <ArrowLeftIcon size={16} />
      {t("cases.detail.back")}
    </Link>
  );

  return (
    <div className="space-y-4">
      {back}
      {notice !== null && <IntakeMessage value={notice} />}
      {view === null && (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("cases.detail.loading")}</span>
          <div aria-hidden className="h-32 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        </div>
      )}
      {view?.kind === "gone" && <Alert>{t("cases.detail.unavailable")}</Alert>}
      {view?.kind === "error" && (
        <div className="space-y-3">
          <Alert tone="error">
            <p>{t("cases.loadFailed")}</p>
            {view.correlationId !== undefined && <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: view.correlationId })}</p>}
          </Alert>
          <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>
            {t("cases.retry")}
          </Button>
        </div>
      )}
      {view?.kind === "ready" && (
        <>
          <CaseFacts item={view.item} />
          {isDecidable(view.item) && (
            <DecisionForm item={view.item} reload={load} onDecided={decided} onGone={() => setView({ kind: "gone" })} onNotice={setNotice} />
          )}
        </>
      )}
    </div>
  );
}

function PartsList({ parts }: { parts: readonly { code?: string; location?: string | null }[] }) {
  return (
    <ul className="text-sm text-slate-900">
      {parts.map((part) => (
        <li key={part.code} className="break-words">
          {[part.code, part.location].filter(Boolean).join(" · ")}
        </li>
      ))}
    </ul>
  );
}

function CaseFacts({ item }: { item: InventoryCase }) {
  const t = useTranslations("InventoryIntake");
  const none = t("cases.detail.none");
  const signal = labelOf(CASE_SIGNAL_LABEL, item.signal);
  const status = labelOf(CASE_STATUS_LABEL, item.status);
  const outcome = labelOf(CASE_OUTCOME_LABEL, item.outcome);
  const { intake, candidate } = item;
  const boundary = candidate?.boundary;
  const type = labelOf(ASSET_TYPE_LABEL, boundary?.assetType);
  const layout = labelOf(RENTAL_SCOPE_LABEL, boundary?.layout);
  const matches = candidate?.ownerMatches;
  const owner = matches === true ? "cases.detail.ownerYes" : matches === false ? "cases.detail.ownerNo" : "cases.detail.ownerUnknown";

  return (
    <>
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-navy-950">{t("cases.detail.title")}</h1>
        {status !== null && <Badge tone="info">{t(status)}</Badge>}
      </header>
      <StepCard title={t("cases.detail.thisIntake")}>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Fact label={t("cases.detail.signal")}>{signal === null ? none : t(signal)}</Fact>
          <Fact label={t("cases.detail.lead")}>{intake?.leadCode ?? none}</Fact>
          <Fact label={t("cases.detail.ward")}>{intake?.wardName ?? none}</Fact>
        </dl>
        <div>
          <p className="text-sm text-slate-500">{t("cases.detail.parts")}</p>
          <PartsList parts={intake?.parts ?? []} />
        </div>
      </StepCard>
      <StepCard title={t("cases.detail.candidate")}>
        <p className="text-sm font-medium text-slate-900">
          {t(candidate?.kind === "INTAKE" ? "cases.detail.candidateIntake" : "cases.detail.candidateProperty", { code: candidate?.code ?? "" })}
        </p>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Fact label={t("cases.detail.assetType")}>{type === null ? none : t(type)}</Fact>
          <Fact label={t("cases.detail.layout")}>{layout === null ? none : t(layout)}</Fact>
          <Fact label={t("cases.detail.ward")}>{boundary?.wardName ?? none}</Fact>
          <Fact label={t("cases.detail.address")}>{boundary?.addressText ?? none}</Fact>
          <Fact label={t("cases.detail.ownerMatches")}>{t(owner)}</Fact>
        </dl>
        <div>
          <p className="text-sm text-slate-500">{t("cases.detail.units")}</p>
          <PartsList parts={candidate?.units ?? []} />
        </div>
      </StepCard>
      {outcome !== null && (
        <StepCard title={t("cases.decision.title")}>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Fact label={t("cases.detail.outcome")}>{t(outcome)}</Fact>
            {item.decidedAt && <Fact label={t("cases.detail.decidedAt")}>{formatDateTime(item.decidedAt)}</Fact>}
            {item.basis && <Fact label={t("cases.detail.basis")}>{item.basis}</Fact>}
          </dl>
        </StepCard>
      )}
    </>
  );
}

type DecisionFormProps = {
  item: InventoryCase;
  reload(): Promise<void>;
  onDecided(item: InventoryCase): void;
  onGone(): void;
  /** A message that outlives this form: the read after a refusal can show a case nobody may decide any more. */
  onNotice(message: Message | null): void;
};

function DecisionForm({ item, reload, onDecided, onGone, onNotice }: DecisionFormProps) {
  const t = useTranslations("InventoryIntake");
  const [form, setForm] = useState<CaseDecisionForm>(NEW_DECISION);
  const outcomeId = useId();
  const proceedingId = useId();
  const basisId = useId();

  const [state, dispatch, pending] = useActionState(async (): Promise<DecisionState> => {
    const problems = decisionProblems(form, item);
    if (Object.keys(problems).length > 0) return { message: null, problems };
    onNotice(null);
    const step = await runCommand({ send: () => decideCase(item.caseId ?? "", decisionBody(form, item)), reload });
    if (step.kind === "done") {
      onDecided(step.data);
      return INITIAL;
    }
    if (step.kind === "leave") onGone();
    const { state: outcome, notice } = commandOutcome(step);
    if (notice !== null) onNotice(notice);
    return { message: outcome.message, problems: {} };
  }, INITIAL);

  const choices = form.outcome === "SAME_ASSET" ? proceedingChoices(item) : [];
  const outcomeError = state.problems.outcome === undefined ? undefined : t("cases.decision.required");
  const proceedingError = state.problems.proceeding === undefined ? undefined : t("cases.decision.required");
  const basisError = state.problems.basis === undefined ? undefined : t(`text.${state.problems.basis}`);

  return (
    <StepCard title={t("cases.decision.title")}>
      {/*
        Not `action`: React resets a form after its action, a controlled select then reads as its placeholder, and nothing
        here renders again to repaint it. A decision is final, so a refusal must leave on screen what the next Save sends.
      */}
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(() => dispatch());
        }}
      >
        {state.message !== null && <IntakeMessage value={state.message} />}
        <fieldset disabled={pending} className="max-w-xl space-y-3">
          <FormField id={outcomeId} label={t("cases.decision.outcome")} required error={outcomeError}>
            <Select
              id={outcomeId}
              value={form.outcome}
              invalid={outcomeError !== undefined}
              aria-required
              aria-describedby={describedBy(outcomeId, outcomeError)}
              onChange={(event) => setForm({ ...form, outcome: event.target.value as CaseDecisionForm["outcome"] })}
            >
              <option value="">{t("cases.decision.outcomePlaceholder")}</option>
              {OUTCOMES.map((value) => (
                <option key={value} value={value}>
                  {t(CASE_OUTCOME_LABEL[value])}
                </option>
              ))}
            </Select>
          </FormField>
          {choices.length > 0 && (
            <FormField id={proceedingId} label={t("cases.decision.proceeding")} required error={proceedingError}>
              <Select
                id={proceedingId}
                value={form.proceedingIntakeId}
                invalid={proceedingError !== undefined}
                aria-required
                aria-describedby={describedBy(proceedingId, proceedingError)}
                onChange={(event) => setForm({ ...form, proceedingIntakeId: event.target.value })}
              >
                <option value="">{t("cases.decision.proceedingPlaceholder")}</option>
                {choices.map((choice) => (
                  <option key={choice.intakeId} value={choice.intakeId}>
                    {t("cases.decision.proceedingOption", { code: choice.code })}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField id={basisId} label={t("cases.decision.basis")} required error={basisError}>
            <Textarea
              id={basisId}
              rows={3}
              autoComplete="off"
              maxLength={REASON_MAX * 2}
              value={form.basis}
              invalid={basisError !== undefined}
              aria-required
              aria-describedby={describedBy(basisId, basisError)}
              onChange={(event) => setForm({ ...form, basis: event.target.value })}
            />
          </FormField>
        </fieldset>
        <Button type="submit" pending={pending}>
          {pending ? t("cases.decision.saving") : t("cases.decision.submit")}
        </Button>
      </form>
    </StepCard>
  );
}
