"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { eligibilityAfter, type EligibilityModel } from "../lib/eligibility-model";
import { getEligibility } from "../services/eligibility-api";

type SectionProps = {
  leadId: string;
  /** The eligibility is read again when this changes: the lead's version. */
  refreshKey: number | undefined;
};

const LOADING: EligibilityModel = { kind: "loading" };

/**
 * Whether each unit of the lead's latest completed intake can get an agreement now, and why not (brokerage-agreement
 * US-1). The first read shows a loading line; a later read keeps what is shown until its answer arrives. No basis, a
 * 404, a 403 and the session states remove the section.
 */
export function EligibilitySection({ leadId, refreshKey }: SectionProps) {
  const t = useTranslations("BrokerageAgreement");
  const [model, setModel] = useState<EligibilityModel>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const headingId = useId();

  useEffect(() => {
    let dropped = false;
    void getEligibility(leadId).then((result) => {
      if (!dropped) setModel(eligibilityAfter(result));
    });
    return () => {
      dropped = true;
    };
  }, [leadId, refreshKey, attempt]);

  // Next keeps this route hidden (Activity): what it showed is forgotten, and the next read starts as the first one.
  useLayoutEffect(() => () => setModel(LOADING), []);

  if (model.kind === "hidden") return null;

  const retry = () => {
    setModel(LOADING);
    setAttempt((count) => count + 1);
  };

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id={headingId} className="text-base font-semibold text-slate-900">
        {t("eligibility.title")}
      </h2>
      {model.kind === "loading" && (
        <p role="status" className="text-sm text-slate-500">
          {t("eligibility.loading")}
        </p>
      )}
      {model.kind === "error" && (
        <div className="space-y-3">
          <Alert tone="error">
            <p>{t("eligibility.loadFailed")}</p>
            {model.correlationId !== undefined && (
              <p className="mt-1 text-xs">{t("eligibility.supportCode", { correlationId: model.correlationId })}</p>
            )}
          </Alert>
          <Button variant="secondary" onClick={retry}>
            {t("eligibility.retry")}
          </Button>
        </div>
      )}
      {model.kind === "ready" && (
        <>
          <ul className="divide-y divide-slate-100">
            {model.rows.map((row, index) => (
              <li key={`${index}:${row.unitId}`} className="space-y-1 py-2 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 break-words text-sm font-semibold text-slate-900">
                    {row.unitCode ?? t("eligibility.noCode")}
                  </span>
                  <Badge tone={row.eligible ? "success" : "warning"}>
                    {t(row.eligible ? "eligibility.eligible" : "eligibility.notEligible")}
                  </Badge>
                </div>
                {row.reasonKeys.map((key, reason) => (
                  <p key={`${reason}:${key}`} className="text-sm text-slate-700">
                    {t(key)}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          {model.assignedOnly && <p className="text-sm text-slate-600">{t("eligibility.assignedOnly")}</p>}
        </>
      )}
    </section>
  );
}
