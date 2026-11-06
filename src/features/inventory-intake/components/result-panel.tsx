"use client";

import { useTranslations } from "next-intl";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format/vietnam-time";

import {
  labelOf,
  MISSING_FOR_BROKERAGE_LABEL,
  READINESS_REASON_LABEL,
  READINESS_STATE_LABEL,
  UNIT_REASON_LABEL,
} from "../lib/labels";
import type { ReadinessState } from "../types";

import { useIntake } from "./intake-context";
import { Fact, StepCard } from "./step-card";

const STATE_TONE: Record<ReadinessState, BadgeTone> = {
  NONE: "neutral",
  USABLE: "success",
  SUSPENDED: "warning",
  ENDED: "danger",
};

/** The result and its readiness, computed by the server on every read (spec 4.11). Nothing here is a listing. */
export function ResultPanel() {
  const t = useTranslations("InventoryIntake");
  const { block } = useIntake();
  const { result, readiness } = block;
  // A result from an earlier row names only its property: the block keeps `result` for the current one.
  const propertyCode = result?.propertyCode ?? block.earlierResult?.propertyCode;
  const reasons = (readiness?.reasons ?? []).flatMap((reason) => labelOf(READINESS_REASON_LABEL, reason) ?? []);
  const blocked = (readiness?.units ?? []).filter((unit) => unit.usable === false);
  const missing = (readiness?.missingForBrokerage ?? []).flatMap((item) => labelOf(MISSING_FOR_BROKERAGE_LABEL, item) ?? []);

  return (
    <StepCard title={t("result.title")}>
      <dl className="grid gap-3 sm:grid-cols-2">
        {propertyCode && <Fact label={t("result.property")}>{propertyCode}</Fact>}
        {result?.unitCount !== undefined && <Fact label={t("result.units")}>{result.unitCount}</Fact>}
        {result?.completedAt && <Fact label={t("result.completedAt")}>{formatDateTime(result.completedAt)}</Fact>}
        {readiness?.state && (
          <Fact label={t("result.readiness")}>
            <Badge tone={STATE_TONE[readiness.state]}>{t(READINESS_STATE_LABEL[readiness.state])}</Badge>
          </Fact>
        )}
      </dl>
      {reasons.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-sm text-slate-700">
          {reasons.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      )}
      {blocked.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("result.unitsHeading")}</h3>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
            {blocked.map((unit) => (
              <li key={unit.unitId}>
                {unit.unitCode}:{" "}
                {(unit.reasons ?? [])
                  .flatMap((reason) => labelOf(UNIT_REASON_LABEL, reason) ?? [])
                  .map((key) => t(key))
                  .join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {missing.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("result.missing")}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {missing.map((key) => (
              <Badge key={key}>{t(key)}</Badge>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500">{t("result.notListing")}</p>
    </StepCard>
  );
}
