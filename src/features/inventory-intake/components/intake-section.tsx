"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { intakeRoute } from "../lib/intake-routes";
import { INTAKE_STATUS_LABEL, READINESS_STATE_LABEL } from "../lib/labels";
import { sectionAfter, type SectionView } from "../lib/section-visibility";
import { getIntakeBlock } from "../services/intake-api";

import { Fact } from "./step-card";

type SectionProps = {
  leadId: string;
  /** The block is read again when this changes: the lead's version. */
  refreshKey: number | undefined;
};

/** The intake on the lead detail, with the link to its page. A 404 hides it (U-7): nothing shows while the switch is off. */
export function IntakeSection({ leadId, refreshKey }: SectionProps) {
  const t = useTranslations("InventoryIntake");
  const [view, setView] = useState<SectionView>({ kind: "hidden" });
  const [attempt, setAttempt] = useState(0);
  const headingId = useId();

  useEffect(() => {
    let dropped = false;
    void getIntakeBlock(leadId).then((result) => {
      if (!dropped) setView(sectionAfter(result));
    });
    return () => {
      dropped = true;
    };
  }, [leadId, refreshKey, attempt]);

  // Next keeps this route hidden (Activity): what it showed is forgotten, as on the lead itself (BR-1).
  useLayoutEffect(() => () => setView({ kind: "hidden" }), []);

  if (view.kind === "hidden") return null;
  const propertyCode = view.kind === "ready" ? (view.block.result?.propertyCode ?? view.block.earlierResult?.propertyCode) : null;
  const readiness = view.kind === "ready" ? view.block.readiness?.state : undefined;

  return (
    <section
      id="inventory-intake"
      aria-labelledby={headingId}
      className="scroll-mt-20 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <h2 id={headingId} className="text-base font-semibold text-slate-900">
        {t("section.title")}
      </h2>
      {view.kind === "error" ? (
        <div className="space-y-3">
          <Alert tone="error">
            <p>{t("section.loadFailed")}</p>
            {view.correlationId !== undefined && (
              <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: view.correlationId })}</p>
            )}
          </Alert>
          <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>
            {t("section.retry")}
          </Button>
        </div>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Fact label={t("section.status")}>
              <Badge tone="info">{t(INTAKE_STATUS_LABEL[view.block.status ?? "NONE"])}</Badge>
            </Fact>
            {propertyCode && <Fact label={t("section.property")}>{propertyCode}</Fact>}
            {readiness && readiness !== "NONE" && <Fact label={t("section.readiness")}>{t(READINESS_STATE_LABEL[readiness])}</Fact>}
          </dl>
          {view.block.gate?.ready !== true && !view.block.result && <p className="text-sm text-slate-600">{t("section.closed")}</p>}
          <Link
            href={intakeRoute(leadId)}
            prefetch={false}
            className="inline-flex text-sm font-semibold text-violet-700 hover:text-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
          >
            {t("section.open")}
          </Link>
        </>
      )}
    </section>
  );
}
