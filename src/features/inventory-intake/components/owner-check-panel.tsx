"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useCallback, useEffect, useId, useLayoutEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format/vietnam-time";

import { commandFailure, commandOutcome, type CommandStep, type IntakeMessage as Message } from "../lib/intake-command";
import { leadRoute } from "../lib/intake-routes";
import { cleanText, REASON_MAX, type TextProblem } from "../lib/intake-text";
import {
  basisKey,
  canStartCheck,
  checkBasisProblem,
  NO_PHRASE,
  type PhraseState,
  phraseIssued,
  phraseMsLeft,
  readsOwnerCheck,
  refusalRows,
  runOwnerCheck,
  signalRows,
} from "../lib/owner-check-state";
import { getOwnerCheckContext, refuseOwnerCheck, startOwnerCheck } from "../services/intake-api";
import type { OwnerCheckContext } from "../types";

import { useIntake, useIntakeLock } from "./intake-context";
import { IntakeMessage } from "./intake-message";
import { OwnerPhrasePanel } from "./owner-phrase-panel";
import { Fact, StepCard } from "./step-card";
import { usePageHide } from "./use-page-hide";

/** One read of the context: the version of the block it was read for, and which attempt it answered. */
type ContextRead = { version: number | null; attempt: number; context: OwnerCheckContext };

type CheckState = { message: Message | null; problem: TextProblem | null };

const INITIAL: CheckState = { message: null, problem: null };

/** The manager's check of a proof (spec 4.6 step 6, U-6). Nothing of it reaches a Sale's screen. */
export function OwnerCheckPanel() {
  const { block, viewer } = useIntake();
  if (!readsOwnerCheck(block, viewer)) return null;
  return <OwnerCheckBody />;
}

function OwnerCheckBody() {
  const t = useTranslations("InventoryIntake");
  const { leadId, block, apply, reload, leave, notify, busy } = useIntake();
  const version = block.version ?? null;
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<ContextRead | null>(null);
  const [readFailed, setReadFailed] = useState<Message | null>(null);
  const [phrase, setPhrase] = useState<PhraseState>(NO_PHRASE);
  const [basis, setBasis] = useState("");
  const basisId = useId();
  const open = canStartCheck(block);

  // A check that ended takes its phrase with it: a later proof on this page must never show it again.
  if (!open && phrase.kind === "shown") setPhrase(NO_PHRASE);

  useEffect(() => {
    let dropped = false;
    void getOwnerCheckContext(leadId).then((result) => {
      if (dropped) return;
      if (result.ok) {
        setRead({ version, attempt, context: result.data });
        setReadFailed(null);
        return;
      }
      const failure = commandFailure(result);
      if (failure.kind === "leave") leave();
      else if (failure.kind === "message") setReadFailed(failure.message);
    });
    return () => {
      dropped = true;
    };
  }, [leadId, version, attempt, leave]);

  useEffect(() => {
    if (phrase.kind !== "shown") return;
    const left = phraseMsLeft(phrase.expiresAt, Date.now());
    if (left === null) return;
    const timer = setTimeout(() => setPhrase(NO_PHRASE), left);
    return () => clearTimeout(timer);
  }, [phrase]);

  const forgetPhrase = useCallback(() => setPhrase(NO_PHRASE), []);
  usePageHide(forgetPhrase);

  // Next keeps this route hidden (Activity): the phrase and the context do not come back with Back.
  useLayoutEffect(
    () => () => {
      setPhrase(NO_PHRASE);
      setRead(null);
    },
    [],
  );

  const context = read !== null && read.version === version && read.attempt === attempt ? read.context : null;
  const forget = () => setAttempt((count) => count + 1);

  const settle = <T,>(step: CommandStep<T>): CheckState => {
    if (step.kind === "leave") leave();
    const { state, notice } = commandOutcome(step);
    if (notice !== null) notify(notice);
    return { message: state.message, problem: null };
  };

  const [state, act, pending] = useActionState(async (_previous: CheckState, kind: "start" | "refuse"): Promise<CheckState> => {
    const problem = checkBasisProblem(basis);
    if (problem !== null || context === null) return { message: null, problem };
    notify(null);
    const body = { proofId: context.proofId ?? "", basis: cleanText(basis), expectedVersion: block.version ?? undefined };
    if (kind === "start") {
      const step = await runOwnerCheck({ send: () => startOwnerCheck(leadId, body), forget, reload });
      if (step.kind === "done") {
        setPhrase(phraseIssued(step.data));
        setBasis("");
        await reload();
      }
      return settle(step);
    }
    const step = await runOwnerCheck({ send: () => refuseOwnerCheck(leadId, body), forget, reload });
    if (step.kind === "done") {
      setPhrase(NO_PHRASE);
      setBasis("");
      apply(step.data);
    }
    return settle(step);
  }, INITIAL);
  useIntakeLock("ownerCheck", pending);

  const message = state.message ?? readFailed;
  const basisError = state.problem === null ? undefined : t(`text.${state.problem}`);
  const hint = context === null ? "ownerCheckPanel.basisHint" : basisKey(context);

  return (
    <StepCard title={t("ownerCheckPanel.title")}>
      {message !== null && <IntakeMessage value={message} />}
      {phrase.kind === "shown" && <OwnerPhrasePanel value={phrase} onDone={forgetPhrase} />}
      {!open && <p className="text-sm text-slate-700">{t("ownerCheckPanel.done")}</p>}
      {context === null
        ? readFailed === null && (
            <div role="status" aria-busy="true">
              <span className="sr-only">{t("ownerCheckPanel.loading")}</span>
              <div aria-hidden className="h-24 animate-pulse rounded-lg bg-slate-100" />
            </div>
          )
        : (
            <>
              <dl className="grid gap-3 sm:grid-cols-3">
                <Fact label={t("ownerCheckPanel.account")}>{context.accountAddressMasked}</Fact>
                <Fact label={t("ownerCheckPanel.accountAge")}>{t("ownerCheckPanel.accountAgeDays", { count: context.accountAgeDays ?? 0 })}</Fact>
                {context.confirmedAt && <Fact label={t("ownerCheckPanel.confirmedAt")}>{formatDateTime(context.confirmedAt)}</Fact>}
                {context.basis && <Fact label={t("ownerCheckPanel.startBasis")}>{context.basis}</Fact>}
              </dl>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{t("ownerCheckPanel.signalsTitle")}</h3>
                <dl className="mt-1 space-y-1 text-sm">
                  {signalRows(context).map((row) => (
                    <div key={row.key} className="flex justify-between gap-4">
                      <dt className="text-slate-600">{t(row.key)}</dt>
                      <dd className="font-medium text-slate-900">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {refusalRows(context).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{t("ownerCheckPanel.refusalsTitle")}</h3>
                  <ul className="mt-1 space-y-1 text-sm text-slate-700">
                    {refusalRows(context).map((row) => (
                      <li key={`${row.checkedAt}-${row.basis}`} className="break-words">
                        {row.checkedAt && <span className="text-xs text-slate-500">{formatDateTime(row.checkedAt)}: </span>}
                        {row.basis}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {open && (
                <form action={() => act("start")} noValidate className="space-y-3">
                  <p className="text-sm text-slate-600">{t("ownerCheckPanel.how")}</p>
                  <Link
                    href={leadRoute(leadId)}
                    prefetch={false}
                    className="inline-flex text-sm font-semibold text-violet-700 hover:text-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                  >
                    {t("ownerCheckPanel.leadLink")}
                  </Link>
                  <fieldset disabled={pending} className="max-w-xl">
                    <FormField id={basisId} label={t("ownerCheckPanel.basis")} required error={basisError} hint={t(hint)}>
                      <Textarea
                        id={basisId}
                        rows={3}
                        autoComplete="off"
                        maxLength={REASON_MAX * 2}
                        value={basis}
                        invalid={basisError !== undefined}
                        aria-required
                        aria-describedby={describedBy(basisId, basisError, true)}
                        onChange={(event) => setBasis(event.target.value)}
                      />
                    </FormField>
                  </fieldset>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" disabled={busy || pending}>
                      {t("ownerCheckPanel.start")}
                    </Button>
                    <Button type="submit" variant="secondary" formAction={() => act("refuse")} disabled={busy || pending}>
                      {t("ownerCheckPanel.refuse")}
                    </Button>
                    {pending && (
                      <span role="status" className="text-sm text-slate-600">
                        {t("ownerCheckPanel.saving")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{t("ownerCheckPanel.refuseHint")}</p>
                </form>
              )}
            </>
          )}
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setAttempt((count) => count + 1);
          void reload();
        }}
      >
        {t("ownerCheckPanel.refresh")}
      </Button>
    </StepCard>
  );
}
