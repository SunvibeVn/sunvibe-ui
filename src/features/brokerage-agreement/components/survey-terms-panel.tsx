"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { phraseText, type ProposalRow, proposalRows } from "../lib/version-terms-model";
import { getSurveyTerms } from "../services/agreement-api";
import type { BrokerageAgreementSurveyTerms } from "../types";

type SurveyTermsPanelProps = {
  agreementId: string;
  /** "Use the survey values": the form copies the parts the proposal holds (brokerage-agreement S3-D13). */
  onUse: (proposal: BrokerageAgreementSurveyTerms) => void;
};

type PanelState =
  | { kind: "loading" }
  | { kind: "error"; correlationId?: string }
  | { kind: "ready"; proposal: BrokerageAgreementSurveyTerms; rows: ProposalRow[] };

const LOADING: PanelState = { kind: "loading" };

/**
 * "Survey reference" beside the draft edit form (brokerage-agreement US-1 AC-3, S3-D11 to S3-D13): the survey's values
 * for the draft's terms, each with where and when the survey took it. It reads once on mount and once per "Try again";
 * the server writes nothing for the read. A failed read leaves the form usable. The proposal is never stored.
 */
export function SurveyTermsPanel({ agreementId, onUse }: SurveyTermsPanelProps) {
  const t = useTranslations("BrokerageAgreement");
  const [state, setState] = useState<PanelState>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();

  useEffect(() => {
    let dropped = false;
    void getSurveyTerms(agreementId).then((result) => {
      if (dropped) return;
      if (result.ok) setState({ kind: "ready", proposal: result.data, rows: proposalRows(result.data) });
      else if (result.kind === "http" && result.correlationId !== undefined)
        setState({ kind: "error", correlationId: result.correlationId });
      else setState({ kind: "error" });
    });
    return () => {
      dropped = true;
    };
  }, [agreementId, attempt]);

  const retry = () => {
    setState(LOADING);
    setAttempt((count) => count + 1);
  };

  return (
    <section aria-labelledby={titleId} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <h5 id={titleId} className="font-semibold text-slate-900">
        {t("survey.title")}
      </h5>
      {state.kind === "loading" && (
        <p role="status" className="text-slate-500">
          {t("survey.loading")}
        </p>
      )}
      {state.kind === "error" && (
        <div className="space-y-2">
          <Alert tone="error">
            <p>{t("survey.loadFailed")}</p>
            {state.correlationId !== undefined && (
              <p className="mt-1 text-xs">{t("edit.supportCode", { code: state.correlationId })}</p>
            )}
          </Alert>
          <Button variant="secondary" className="px-4 py-2" onClick={retry}>
            {t("survey.retry")}
          </Button>
        </div>
      )}
      {state.kind === "ready" && state.rows.length === 0 && <p className="text-slate-700">{t("survey.empty")}</p>}
      {state.kind === "ready" && state.rows.length > 0 && (
        <>
          <dl className="space-y-2">
            {state.rows.map((row, index) => (
              <div key={`${index}:${row.labelKey}`}>
                <dt className="text-slate-500">{t(row.labelKey)}</dt>
                <dd className="break-words text-slate-900">{phraseText(t, row.value)}</dd>
                <dd className="text-xs text-slate-500">
                  <span>{t(row.sourceKey)}</span>
                  {row.dateText !== "" && (
                    <>
                      {", "}
                      <span>{row.dateText}</span>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <Button variant="secondary" className="px-4 py-2" onClick={() => onUse(state.proposal)}>
            {t("survey.use")}
          </Button>
        </>
      )}
    </section>
  );
}
